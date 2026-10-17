import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { validateState, LIMITS } from '../src/host/storage.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = 'root = Form("说明",[{name:"x",label:"说明甲",type:"textarea"},{name:"y",label:"说明乙",type:"textarea"}])';
const digest = value => createHash('sha256').update(value).digest('hex');
const css = await readFile(join(root, 'src/client/styles/surface.css'), 'utf8');
const sourceSHA256 = Object.fromEntries(await Promise.all(['src/runtime/limits.mjs', 'src/client/document-store.mjs', 'src/client/Surface.jsx', 'src/client/components/shared.jsx', 'src/client/components/controls.jsx'].map(async file => [file, digest(await readFile(join(root, file)))])));
const compiled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
  import React from 'react';import{createRoot}from'react-dom/client';
  import{IntelligentSurface}from'./src/client/Surface.jsx';
  createRoot(document.getElementById('root')).render(<IntelligentSurface sessionId="synthetic-utf8-ui" blockId="1:1:0:0" source={${JSON.stringify(source)}}/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const bundle = compiled.outputFiles[0].text;

test('real browser Surface explains rejected UTF-8 edits and persists the exact allowed boundary', { timeout: 30000 }, async t => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  let record = { revision: 0, source, sourceRevision: digest(source), componentsVersion: 4, state: {} };
  await page.route('http://127.0.0.1:9191/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname !== '/intelligent-ui/api/state') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div>' });
    if (request.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) });
    const input = request.postDataJSON(), stateBytes = Buffer.byteLength(JSON.stringify(input.state), 'utf8');
    writes.push({ stateBytes, expectedRevision: input.expectedRevision });
    assert.equal(input.source, source);
    assert.equal(input.expectedRevision, record.revision);
    try { record = { ...input, state: validateState(input.state), componentsVersion: 4, revision: record.revision + 1 }; }
    catch (error) { return route.fulfill({ status: error.statusCode, contentType: 'application/json', body: JSON.stringify({ error: error.message }) }); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) });
  });
  const mount = async () => { await page.addStyleTag({ content: css }); await page.addScriptTag({ content: bundle }); };
  await page.goto('http://127.0.0.1:9191/'); await mount();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  const first = page.getByRole('textbox', { name: '说明甲', exact: true });
  const second = page.getByRole('textbox', { name: '说明乙', exact: true });
  const chinese = '汉'.repeat(24000);
  await first.fill(chinese);
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(writes.length, 1);
  await second.fill(chinese);
  const alert = page.getByRole('alert').filter({ hasText: '128 KiB' });
  await alert.waitFor();
  assert.match(await alert.textContent(), /缩短文字/);
  assert.equal(await second.getAttribute('aria-invalid'), 'true');
  assert.equal(await second.inputValue(), '');
  assert.equal(await first.inputValue(), chinese);
  assert.equal(await page.getByRole('button', { name: '重试保存', exact: true }).count(), 0);
  assert.equal(writes.length, 1, 'a rejected edit never reaches persistence');
  const rejectedAlert = await alert.textContent();
  if (process.env.IUI_UI_EVIDENCE) {
    await mkdir(process.env.IUI_UI_EVIDENCE, { recursive: true });
    await page.screenshot({ path: join(process.env.IUI_UI_EVIDENCE, 'utf8-limit-rejected-edit.png'), fullPage: true });
  }
  const base = '汉'.repeat(19685);
  const boundary = base + 'x'.repeat(LIMITS.stateBytes - Buffer.byteLength(JSON.stringify({ x: chinese, y: base }), 'utf8'));
  assert.equal(Buffer.byteLength(JSON.stringify({ x: chinese, y: boundary }), 'utf8'), LIMITS.stateBytes);
  await second.fill(boundary);
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(await second.getAttribute('aria-invalid'), 'false');
  assert.equal(record.state.y, boundary);
  assert.deepEqual(writes.map(write => write.stateBytes), [72015, LIMITS.stateBytes]);
  await second.fill(boundary + 'x');
  await alert.waitFor();
  assert.equal(await second.inputValue(), boundary, 'an over-limit edit preserves the exact previous valid value');
  assert.equal(writes.length, 2);
  await page.reload(); await mount();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(await first.inputValue(), chinese);
  assert.equal(await second.inputValue(), boundary, 'exact-boundary persisted state remains readable after remount');
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.deepEqual(errors, []);
  if (process.env.IUI_UI_EVIDENCE) await writeFile(join(process.env.IUI_UI_EVIDENCE, 'utf8-limit-ui.json'), JSON.stringify({ scope: 'actual React Surface and browser DOM with synthetic API and state; no DSH host or real account', sourceSHA256, bundleSHA256: digest(bundle), rejectedAlert, writes, persistedBytes: Buffer.byteLength(JSON.stringify(record.state), 'utf8'), errors }, null, 2));
});
