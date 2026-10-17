import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = 'root = Counter("人数","people",4,1,12)';
const digest = value => createHash('sha256').update(value).digest('hex');
const css = await readFile(join(root, 'src/client/styles/surface.css'), 'utf8');
const compiled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
  import React from'react';import{createRoot}from'react-dom/client';
  import{installArtifactPane}from'./src/client/host/pane.jsx';import{IntelligentSurface}from'./src/client/Surface.jsx';
  const root=createRoot(document.getElementById('root'));let Pane,controller;
  const sessionId='seeded-session',blockId='1:1:0:0',mounted={getSnapshot:()=>sessionId,subscribe:()=>()=>{}};
  const ctx={sidebarRight:{mounted},sidebarRightTabs:{register:()=>()=>{}},
    uiSession:{adapter:{current:{getSnapshot:()=>({key:sessionId})}}},
    slots:{inject:(_name,run)=>run(),register:(_options,Component)=>{Pane=Component;return()=>{};}}};
  const pane=installArtifactPane(ctx,{Surface:IntelligentSurface,bridge:{submit:()=>Promise.resolve()}});
  window.restoredPane={open(){controller=new AbortController();const tab={visible:true,signal:controller.signal,navigation:{params:{blockId},revision:1},actions:{close:()=>window.restoredPane.close()}};root.render(<Pane sessionId={sessionId} useTabInfo={()=>({tab})}/>);},
    close(){controller.abort();root.render(null);},dispose(){root.unmount();pane.dispose();}};
  window.restoredPane.open();
` }, bundle: true, write: false, format: 'iife', platform: 'browser' });

async function fixture(t, { failInitial = false, failPost = false, projection = false } = {}) {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), calls = [], errors = [];
  let initial = failInitial, postFails = failPost;
  let current = { session: 'seeded-session', block: '1:1:0:0', protocolVersion: 1, source, sourceRevision: digest(source), componentsVersion: 2, revision: 7, state: { people: 7 } };
  if (projection) { delete current.session; delete current.block; current = { ...current, componentsVersion: 4, revision: 0, state: {}, persisted: false }; }
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:9191/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname !== '/intelligent-ui/api/state') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div>' });
    calls.push(request.method());
    if (initial) { initial = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic read outage' }) }); }
    if (request.method() === 'POST') {
      if (postFails) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic write outage' }) });
      const input = request.postDataJSON(); assert.equal(input.source, source); assert.equal(input.expectedRevision, current.revision);
      current = { ...current, revision: current.revision + 1, state: input.state };
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(current) });
  });
  await page.goto('http://127.0.0.1:9191/');
  return { page, calls, errors, record: () => current, enableWrites: () => { postFails = false; }, mount: async () => { await page.addStyleTag({ content: css }); await page.addScriptTag({ content: compiled.outputFiles[0].text }); } };
}

test('a restored real Pane reuses its first full record, preserves legacy edits and fetches again after store reclamation', { timeout: 30000 }, async t => {
  const f = await fixture(t); await f.mount();
  await f.page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.deepEqual(f.calls, ['GET'], 'Pane and Surface share the first complete read');
  assert.equal(await f.page.locator('output').textContent(), '7');
  await f.page.getByRole('button', { name: '增加人数', exact: true }).click();
  await f.page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(f.record().revision, 8); assert.equal(f.record().state.people, 8); assert.equal(f.record().componentsVersion, 2);
  await f.page.getByRole('button', { name: '关闭交互作品', exact: true }).click();
  await f.page.evaluate(() => window.restoredPane.open());
  await f.page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.deepEqual(f.calls, ['GET', 'POST'], 'reopening the live cache issues no extra GET');
  assert.equal(await f.page.locator('output').textContent(), '8');
  await f.page.clock.install();
  await f.page.getByRole('button', { name: '关闭交互作品', exact: true }).click();
  await f.page.clock.fastForward(30001);
  await f.page.evaluate(() => window.restoredPane.open());
  await f.page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.deepEqual(f.calls, ['GET', 'POST', 'GET'], 'the normal 30-second cleanup retires the store and its one-shot seed');
  assert.equal(await f.page.locator('output').textContent(), '8', 'a reclaimed store reads current data instead of replaying its old seed');
  assert.deepEqual(f.errors, []);
});

test('an unsaved native GET projection is bound to the Pane request without another GET or automatic POST', { timeout: 30000 }, async t => {
  const f = await fixture(t, { projection: true }); await f.mount();
  await f.page.getByRole('status').filter({ hasText: '默认设置' }).waitFor();
  assert.equal(await f.page.locator('output').textContent(), '4');
  assert.deepEqual(f.calls, ['GET'], 'native projections intentionally omit saved-record identity fields');
  assert.deepEqual(f.errors, []);
});

test('a failed Pane initial read preserves a backed draft and its retry shares one successful recovery GET', { timeout: 30000 }, async t => {
  const f = await fixture(t, { failInitial: true, failPost: true });
  const key = 'dsh-iui.draft.v1:seeded-session:1:1:0:0:' + digest(source);
  const raw = JSON.stringify({ source, state: { people: 9 }, dirty: ['people'], revision: 7, componentsVersion: 2 });
  await f.page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key, raw });
  await f.mount(); await f.page.getByRole('button', { name: '重试', exact: true }).waitFor();
  assert.equal(await f.page.evaluate(key => sessionStorage.getItem(key), key), raw);
  await f.page.getByRole('button', { name: '重试', exact: true }).click();
  await f.page.getByRole('button', { name: '重试保存', exact: true }).waitFor();
  assert.equal(f.calls.filter(method => method === 'GET').length, 2, 'one failed Pane GET and one shared successful GET');
  assert.equal(await f.page.locator('output').textContent(), '9');
  assert.equal(await f.page.evaluate(key => sessionStorage.getItem(key), key), raw);
  f.enableWrites(); await f.page.getByRole('button', { name: '重试保存', exact: true }).click();
  await f.page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(f.record().state.people, 9); assert.equal(f.record().componentsVersion, 2);
  assert.equal(await f.page.evaluate(key => sessionStorage.getItem(key), key), null);
  assert.deepEqual(f.errors, []);
});
