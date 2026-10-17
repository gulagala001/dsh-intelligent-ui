import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStore, sourceHash } from '../src/client/document-store.mjs';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { protocolVersion } from '../src/protocol/version.mjs';

const source = 'root = NumberInput("数量","count",4)';
const cases = [
  ['null versus default', { count: null }, 4, true],
  ['false versus default', { count: false }, 4, true],
  ['zero versus default', { count: 0 }, 4, true],
  ['space versus default', { count: ' ' }, 4, true],
  ['same number', { count: 4 }, 4, false],
  ['missing equals source default', {}, 4, false],
  ['missing differs from local edit', {}, 6, true],
  ['same null', { count: null }, null, false],
  ['same false', { count: false }, false, false],
  ['same zero', { count: 0 }, 0, false],
  ['same space', { count: ' ' }, ' ', false],
  ['numeric string differs from number', { count: '4' }, 4, true],
];
for (const [name, remoteState, local, pending] of cases) {
  test(`draft acknowledgement compares actual JSON values: ${name}`, async t => {
    const data = new Map(), original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } });
    let writes = 0;
    const record = { revision: 5, sourceRevision: await sourceHash(source), componentsVersion: 2, state: { ...remoteState, extra: 'REMOTE-UNTOUCHED' } };
    const store = new DocumentStore('null-ack', '1:1:0:0', { read: async (_s, _b, input) => { if (input) writes++; return structuredClone(record); } });
    t.after(() => { store.dispose(); if (original) Object.defineProperty(globalThis, 'sessionStorage', original); else delete globalThis.sessionStorage; });
    const key = store.journalKey(source);
    data.set(key, JSON.stringify({ source, state: { count: local }, dirty: ['count'], revision: 4, componentsVersion: 2 }));
    store.update(source, false);
    for (let i = 0; i < 30 && store.snapshot.status === 'loading'; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(store.snapshot.status, pending ? 'conflict' : 'saved');
    assert.equal(store.dirty.has('count'), pending);
    assert.equal(store.snapshot.state.count, local);
    assert.equal(store.snapshot.state.extra, 'REMOTE-UNTOUCHED');
    assert.equal(store.snapshot.componentsVersion, 2);
    assert.equal(writes, 0, 'recovery never silently resolves a changed remote revision');
    store.dispose();
    if (pending) assert.equal(JSON.parse(data.get(key)).state.count, local, 'closing preserves the sole pending local value');
    else assert.equal(data.has(key), false, 'an actually equal remote value can acknowledge the draft');
  });
}

test('real Surface keeps a null-versus-default conflict backed through close and resolves only on explicit confirmation', { timeout: 30000 }, async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const compiled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{IntelligentSurface}from'./src/client/Surface.jsx';
    function Harness(){const[visible,setVisible]=useState(true);return <><button onClick={()=>setVisible(value=>!value)}>{visible?'关闭内容':'打开内容'}</button>{visible&&<IntelligentSurface source={${JSON.stringify(source)}} sessionId="null-ui" blockId="1:1:0:0"/>}</>;}
    createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, write: false, format: 'iife', platform: 'browser' });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let writes = 0, remote = { session: 'null-ui', block: '1:1:0:0', source, protocolVersion, revision: 5, sourceRevision: createHash('sha256').update(source).digest('hex'), componentsVersion: 2, state: { count: null, extra: 'REMOTE-UNTOUCHED' } };
  await page.route('http://127.0.0.1:9191/**', route => {
    const request = route.request();
    if (new URL(request.url()).pathname !== '/intelligent-ui/api/state') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div>' });
    if (request.method() === 'POST') { const input = request.postDataJSON(); assert.equal(input.expectedRevision, remote.revision); writes++; remote = { ...remote, revision: remote.revision + 1, state: input.state }; }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(remote) });
  });
  await page.goto('http://127.0.0.1:9191/');
  const key = 'dsh-iui.draft.v1:null-ui:1:1:0:0:' + remote.sourceRevision;
  await page.evaluate(({ key, source }) => sessionStorage.setItem(key, JSON.stringify({ source, state: { count: 4 }, dirty: ['count'], revision: 4, componentsVersion: 2 })), { key, source });
  await page.addScriptTag({ content: compiled.outputFiles[0].text });
  await page.getByRole('button', { name: '保留当前设置并保存', exact: true }).waitFor({ timeout: 3000 });
  assert.equal(await page.getByRole('spinbutton', { name: '数量', exact: true }).inputValue(), '4');
  assert.equal(writes, 0); assert.equal(remote.state.count, null);
  await page.getByRole('button', { name: '关闭内容', exact: true }).click();
  assert.equal(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).state.count, key), 4);
  await page.getByRole('button', { name: '打开内容', exact: true }).click();
  await page.getByRole('button', { name: '保留当前设置并保存', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(writes, 1); assert.equal(remote.state.count, 4); assert.equal(remote.state.extra, 'REMOTE-UNTOUCHED'); assert.equal(remote.componentsVersion, 2);
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), key), null);
  assert.deepEqual(errors, []);
});
