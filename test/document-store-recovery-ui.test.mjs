import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceA = 'root = Input("重要备注","note","A-default")';
const sourceB = 'root = Input("重要备注","note","B-default")';
const digest = source => createHash('sha256').update(source).digest('hex');
const sourceSHA256 = digest(await readFile(join(root, 'src/client/document-store.mjs')));
const css = await readFile(join(root, 'src/client/styles/surface.css'), 'utf8');
const compiled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
  import React,{useState}from'react';import{createRoot}from'react-dom/client';
  import{IntelligentSurface}from'./src/client/Surface.jsx';
  function Harness(){const[visible,setVisible]=useState(true),[source,setSource]=useState(${JSON.stringify(sourceA)});
    return <><button onClick={()=>setVisible(value=>!value)}>{visible?'关闭交互':'重新打开交互'}</button>
      <button onClick={()=>setSource(value=>value===${JSON.stringify(sourceA)}?${JSON.stringify(sourceB)}:${JSON.stringify(sourceA)})}>切换源文</button>
      {visible&&<IntelligentSurface sessionId="synthetic-backed-ui" blockId="1:1:0:0" source={source}/>}</>;
  }createRoot(document.getElementById('root')).render(<Harness/>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const bundle = compiled.outputFiles[0].text;
const bundleSHA256 = digest(bundle);

for (const action of ['close-and-retry', 'source-switch']) {
  test(`real Surface preserves an unread backed draft after GET failure: ${action}`, { timeout: 30000 }, async t => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
    t.after(() => browser.close());
    const page = await browser.newPage(), errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    let currentSource = sourceA, failRead = false, failWrite = true;
    const records = new Map([[sourceA, { revision: 0, source: sourceA, sourceRevision: digest(sourceA), componentsVersion: 2, state: {} }],
      [sourceB, { revision: 0, source: sourceB, sourceRevision: digest(sourceB), componentsVersion: 4, state: {} }]]);
    await page.route('http://127.0.0.1:9191/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname !== '/intelligent-ui/api/state') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div>' });
      const method = request.method(); calls.push({ method, source: currentSource });
      if (method === 'GET') return route.fulfill({ status: failRead ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failRead ? { error: 'Synthetic read outage' } : records.get(currentSource)) });
      const input = request.postDataJSON(), current = records.get(currentSource);
      if (failWrite) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic write outage' }) });
      assert.equal(input.source, currentSource, 'the current source owns every accepted write');
      assert.equal(input.expectedRevision, current.revision, 'the server independently checks the CAS revision');
      const next = { ...input, revision: current.revision + 1, componentsVersion: current.componentsVersion };
      records.set(currentSource, next);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(next) });
    });
    const mount = async () => { await page.addStyleTag({ content: css }); await page.addScriptTag({ content: bundle }); };
    const journal = () => page.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).filter(key => key.startsWith('dsh-iui.draft.v1:')).map(key => [key, sessionStorage.getItem(key)])));
    await page.goto('http://127.0.0.1:9191/'); await mount();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    const input = page.getByRole('textbox', { name: '重要备注', exact: true });
    await input.fill('IMPORTANT-BROWSER-BACKUP');
    await page.getByRole('button', { name: '重试保存', exact: true }).waitFor();
    const backups = await journal(), key = Object.keys(backups)[0], raw = backups[key];
    assert.equal(JSON.parse(raw).state.note, 'IMPORTANT-BROWSER-BACKUP');
    await page.getByRole('button', { name: '关闭交互', exact: true }).click();
    failRead = true;
    await page.reload(); await mount();
    await page.getByRole('button', { name: '重试读取', exact: true }).waitFor();
    assert.equal(await input.inputValue(), 'A-default');
    assert.equal(await input.isDisabled(), true);
    await page.getByRole('button', { name: '关闭交互', exact: true }).click();
    assert.equal((await journal())[key], raw, 'actual Surface effect cleanup preserves an unread sessionStorage backup');
    await page.getByRole('button', { name: '重新打开交互', exact: true }).click();
    if (action === 'source-switch') {
      currentSource = sourceB; failRead = false; failWrite = false;
      await page.getByRole('button', { name: '切换源文', exact: true }).click();
      await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
      assert.equal(await input.inputValue(), 'B-default');
      await input.fill('DURABLE-BROWSER-B');
      await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
      assert.equal(records.get(sourceB).state.note, 'DURABLE-BROWSER-B');
      assert.equal((await journal())[key], raw, 'a B save preserves the unread A backup');
      currentSource = sourceA; failWrite = true;
      await page.getByRole('button', { name: '切换源文', exact: true }).click();
    } else {
      await page.getByRole('button', { name: '重试读取', exact: true }).click();
      await page.getByRole('button', { name: '重试读取', exact: true }).waitFor();
      assert.equal((await journal())[key], raw, 'a failed user retry still preserves the backup');
      failRead = false;
      await page.getByRole('button', { name: '重试读取', exact: true }).click();
    }
    await page.getByRole('button', { name: '重试保存', exact: true }).waitFor();
    assert.equal(await input.inputValue(), 'IMPORTANT-BROWSER-BACKUP');
    assert.equal(await input.isDisabled(), false);
    assert.equal((await journal())[key], raw, 'the restored draft remains backed until persistence confirms it');
    failWrite = false;
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    assert.equal(records.get(sourceA).state.note, 'IMPORTANT-BROWSER-BACKUP');
    assert.equal((await journal())[key], undefined, 'only the successful server receipt clears the backup');
    assert.deepEqual(errors, []);
    if (process.env.IUI_UI_EVIDENCE) {
      const directory = process.env.IUI_UI_EVIDENCE; await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, `backed-read-failure-${action}.png`), fullPage: true });
      await writeFile(join(directory, `backed-read-failure-${action}.json`), JSON.stringify({ scope: 'actual browser DOM and sessionStorage with synthetic API responses; no DSH host or real account', sourceSHA256, bundleSHA256, action, calls, records: [...records.values()], errors }, null, 2));
    }
  });
}
