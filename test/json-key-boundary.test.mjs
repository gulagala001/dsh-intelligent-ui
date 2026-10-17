import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { assertJSON, LIMITS, UIError } from '../src/runtime/limits.mjs';
import { compile, evaluateDocument } from '../src/runtime/evaluate.mjs';
import { DocumentStore } from '../src/client/document-store.mjs';
import { StateStorage, sourceHash, validateState } from '../src/host/storage.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const keyError = error => error instanceof UIError && error.code === 'STATE_KEY_LIMIT' && /256/.test(error.message);
const badStateKey = error => error.statusCode === 400 && error.message === 'Invalid state key';
const key256 = 'k'.repeat(256), key257 = 'k'.repeat(257);
const buttonSource = key => `$note = "initial"\nroot = Button("设置元数据",{type:"set",name:"metadata",value:{${JSON.stringify(key)}:note}})`;
const hydrate = async store => {
  for (let n = 0; n < 30 && store.snapshot.status === 'loading'; n++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.snapshot.status, 'saved');
};

for (const [name, boundary, oversized] of [
  ['ASCII', 'a'.repeat(256), 'a'.repeat(257)],
  ['Chinese', '汉'.repeat(256), '汉'.repeat(257)],
  ['emoji UTF-16 pairs', '🌏'.repeat(128), '🌏'.repeat(128) + 'x'],
]) {
  test(`JSON keys keep the server's 256 UTF-16-unit boundary: ${name}`, () => {
    assert.equal(boundary.length, 256);
    assert.equal(oversized.length, 257);
    if (name !== 'ASCII') assert.ok(Buffer.byteLength(boundary, 'utf8') > 256, 'accepted keys may occupy more than 256 bytes');
    if (name.startsWith('emoji')) assert.equal([...boundary].length, 128, 'the contract counts UTF-16 units rather than Unicode code points');
    for (const wrap of [key => ({ [key]: 'value' }), key => ({ metadata: { [key]: 'value' } }), key => ({ metadata: [{ [key]: 'value' }] })]) {
      const valid = wrap(boundary), invalid = wrap(oversized);
      assert.equal(assertJSON(valid), valid);
      assert.deepEqual(validateState(valid), valid);
      assert.throws(() => validateState(invalid), badStateKey);
      assert.throws(() => assertJSON(invalid), keyError);
    }
    assert.equal(LIMITS.stateKeyChars, 256);
  });
}

test('unsafe ancestor and nested keys retain their existing guard', () => {
  for (const key of ['__proto__', 'prototype', 'constructor', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']) {
    const unsafe = JSON.parse(`{${JSON.stringify(key)}:{"value":1}}`);
    for (const state of [unsafe, { metadata: unsafe }, { metadata: [unsafe] }]) {
      assert.throws(() => assertJSON(state), error => error.code === 'UNSAFE_KEY');
      assert.throws(() => validateState(state), badStateKey);
    }
  }
  const unsafeFirst = JSON.parse(`{"constructor":{${JSON.stringify(key257)}:1}}`);
  assert.throws(() => assertJSON(unsafeFirst), error => error.code === 'UNSAFE_KEY', 'an unsafe ancestor is rejected before its oversized descendant');
  assert.throws(() => assertJSON({ x: undefined }), error => error.code === 'INVALID_DATA');
  assert.throws(() => assertJSON({ x: Infinity }), error => error.code === 'NON_FINITE');
});

test('dynamic Button set and direct edits reject long nested keys without replacing a valid draft', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), journal = new Map();
  const stores = [];
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => journal.get(key) ?? null, setItem: (key, value) => journal.set(key, value), removeItem: key => journal.delete(key) } });
  t.after(() => { for (const store of stores) store.dispose(); if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else delete globalThis.sessionStorage; });
  for (const key of [key256, key257]) {
    const source = buttonSource(key), document = compile(source), writes = [];
    const store = new DocumentStore('synthetic-key-draft-' + key.length, '1:1:0:0', {
      hash: async () => digest(source), read: async (_session, _block, input) => {
        if (!input) return { revision: 0, sourceRevision: digest(source), state: {} };
        writes.push(input);
        return { ...input, revision: 1, state: validateState(input.state) };
      },
    });
    stores.push(store);
    store.update(source, false); await hydrate(store);
    store.set('note', 'VALID-UNSAVED-DRAFT');
    const state = store.state, dirty = [...store.dirty], backups = [...journal];
    const action = evaluateDocument(document, state).props.action;
    assert.equal(action.value[key], state.note, 'Button action resolves the current live variable');
    if (key.length === 257) {
      assert.throws(() => store.action(action), keyError);
      assert.throws(() => store.set('metadata', action.value), keyError);
      assert.equal(store.state, state);
      assert.deepEqual([...store.dirty], dirty);
      assert.deepEqual([...journal], backups, 'rejected values cannot replace a valid journal backup');
      assert.equal(store.snapshot.source, source);
    } else {
      store.action(action);
      assert.deepEqual(store.state.metadata, { [key]: 'VALID-UNSAVED-DRAFT' });
    }
    await store.save();
    assert.equal(writes.length, 1);
    assert.equal(store.snapshot.status, 'saved');
    assert.equal(writes[0].state.note, 'VALID-UNSAVED-DRAFT');
    assert.equal(Object.hasOwn(writes[0].state, 'metadata'), key.length === 256);
    store.dispose();
  }
});

test('storage rejects an oversized key synchronously before joining a pending valid save queue', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'iui-key-queue-')));
  const storage = new StateStorage(directory);
  let release;
  t.after(async () => { release?.(); await storage.close(); await rm(directory, { recursive: true, force: true }); });
  await storage.initialize();
  const source = buttonSource(key256), input = { session: 'synthetic-key-storage', block: '1:1:0:0', expectedRevision: 0, source, sourceRevision: sourceHash(source), state: { metadata: { [key256]: 'baseline' } } };
  await storage.save(input);
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let verified = 0;
  const pending = storage.save({ ...input, expectedRevision: 1, state: { metadata: { [key256]: 'valid queued value' } } }, async () => { verified++; entered(); await gate; });
  await started;
  const invalid = { ...input, expectedRevision: 1, state: { metadata: [{ [key257]: 'rejected' }] } };
  for (let attempt = 0; attempt < 2; attempt++) assert.throws(() => storage.save(invalid, () => { verified++; }), badStateKey);
  assert.equal(verified, 1, 'invalid requests never enter the verification/save queue');
  assert.equal((await storage.get(input.session, input.block)).state.metadata[key256], 'baseline');
  release();
  assert.equal((await pending).revision, 2);
  const durable = await storage.get(input.session, input.block);
  assert.deepEqual(durable.state, { metadata: { [key256]: 'valid queued value' } });
  assert.equal(verified, 1);
});

test('real Surface shows the local key error, preserves settings, and saves the 256-unit boundary', { timeout: 30000 }, async t => {
  const source = `$note = "initial"\nroot = Stack([Input("备注","note","initial"),Button("设置256键",{type:"set",name:"metadata",value:{${JSON.stringify(key256)}:note}}),Button("设置257键",{type:"set",name:"metadata",value:{${JSON.stringify(key257)}:note}})])`;
  const files = ['src/runtime/limits.mjs', 'src/host/storage.mjs', 'src/client/document-store.mjs', 'src/runtime/evaluate.mjs', 'src/client/components/controls.jsx', 'src/client/Surface.jsx', 'test/json-key-boundary.test.mjs'];
  const sourceSHA256 = Object.fromEntries(await Promise.all(files.map(async file => [file, digest(await readFile(join(root, file)))])));
  const compiled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `import React from'react';import{createRoot}from'react-dom/client';import{IntelligentSurface}from'./src/client/Surface.jsx';createRoot(document.getElementById('root')).render(<IntelligentSurface sessionId="synthetic-json-key-ui" blockId="1:1:0:0" source={${JSON.stringify(source)}}/>);` }, bundle: true, write: false, format: 'iife', platform: 'browser' });
  const bundle = compiled.outputFiles[0].text;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  let browserResult;
  t.after(async () => {
    await browser.close();
    if (process.env.IUI_KEY_EVIDENCE && browserResult) await writeFile(join(process.env.IUI_KEY_EVIDENCE, 'browser.json'), JSON.stringify({ ...browserResult, cleanup: { browserClosed: !browser.isConnected(), serversStarted: 0, nativeProcessesStarted: 0 } }, null, 2));
  });
  const page = await browser.newPage(), errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  let record = { revision: 0, source, sourceRevision: digest(source), componentsVersion: 4, state: {} };
  await page.route('http://127.0.0.1:9191/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname !== '/intelligent-ui/api/state') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div>' });
    if (request.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) });
    const input = request.postDataJSON();
    writes.push({ keyLengths: Object.keys(input.state.metadata ?? {}).map(key => key.length), note: input.state.note });
    assert.equal(input.expectedRevision, record.revision);
    try { record = { ...input, state: validateState(input.state), revision: record.revision + 1, componentsVersion: 4 }; }
    catch (error) { return route.fulfill({ status: error.statusCode, contentType: 'application/json', body: JSON.stringify({ error: error.message }) }); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) });
  });
  const mount = async () => { await page.addStyleTag({ content: await readFile(join(root, 'src/client/styles/surface.css'), 'utf8') }); await page.addScriptTag({ content: bundle }); };
  await page.goto('http://127.0.0.1:9191/'); await mount();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  const note = page.getByRole('textbox', { name: '备注', exact: true });
  await note.fill('USER-VALID-VALUE');
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(writes.length, 1);
  await page.getByRole('button', { name: '设置257键', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: '256' });
  await alert.waitFor({ timeout: 5000 });
  const localError = await alert.textContent();
  assert.equal(await note.inputValue(), 'USER-VALID-VALUE');
  assert.equal(writes.length, 1, 'a rejected Button action never creates an invalid persistence request');
  assert.equal(await page.getByRole('button', { name: '重试保存', exact: true }).count(), 0);
  assert.equal(Object.hasOwn(record.state, 'metadata'), false);
  if (process.env.IUI_KEY_EVIDENCE) {
    await mkdir(process.env.IUI_KEY_EVIDENCE, { recursive: true });
    await page.screenshot({ path: join(process.env.IUI_KEY_EVIDENCE, 'local-key-error.png'), fullPage: true });
  }
  await page.getByRole('button', { name: '设置256键', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(record.state.metadata[key256], 'USER-VALID-VALUE');
  assert.deepEqual(writes, [{ keyLengths: [], note: 'USER-VALID-VALUE' }, { keyLengths: [256], note: 'USER-VALID-VALUE' }]);
  await page.reload(); await mount();
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal(await note.inputValue(), 'USER-VALID-VALUE');
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.deepEqual(errors, []);
  for (const file of files) assert.equal(digest(await readFile(join(root, file))), sourceSHA256[file], 'source changed during test: ' + file);
  browserResult = { scope: 'actual React Surface/browser with synthetic API and state; no native DSH host or real model', recordedAt: new Date().toISOString(), sourceSHA256, bundleSHA256: digest(bundle), localError, writes, boundaryRestored: record.state.metadata[key256] === 'USER-VALID-VALUE', errors };
});
