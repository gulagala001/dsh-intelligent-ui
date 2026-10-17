import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createSessionBridge } from '../src/client/host/session.mjs';
import { DocumentStore } from '../src/client/document-store.mjs';
import { LIMITS, assertJSON } from '../src/runtime/limits.mjs';
import { protocolVersion, componentsVersion } from '../src/protocol/version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const until = async predicate => {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(predicate(), 'expected asynchronous phase did not arrive');
};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function observable(value) {
  const listeners = new Set();
  return { getSnapshot: () => value, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, set(next) { value = next; for (const listener of listeners) listener(); }, get listenerCount() { return listeners.size; } };
}
const inputFor = source => ({ source, state: { note: 'VALID-ORIGINAL', metadata: { preserved: true } }, diagnostic: '未知函数或组件 Missing', componentsVersion });
const recordFor = (session, block, source, version = componentsVersion) => ({ session, block, source, sourceRevision: digest(source), protocolVersion, componentsVersion: version, revision: 0, state: {} });
const stateBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
function stateAtLimit(prefix) {
  const state = Object.fromEntries(Array.from({ length: 4 }, (_, n) => [prefix + n, 'a'.repeat(32000)]));
  state[prefix + 'padding'] = '';
  state[prefix + 'padding'] = 'a'.repeat(LIMITS.stateBytes - stateBytes(state));
  assert.equal(stateBytes(state), LIMITS.stateBytes);
  assertJSON(state);
  return state;
}

function bridgeFixture(t, { records = new Map(), upload, prompt, read } = {}) {
  const current = observable({ key: 'synthetic-repair-session' }), panelInfo = observable({ activePanelId: null });
  const uploads = [], prompts = [], echoes = [], abandoned = [], gets = [], uploadSignals = [], receipts = [];
  const binding = { session: {
    getSnapshot: () => ({ removed: false }),
    beginSubmission(input) { const requestId = 'repair-request-' + echoes.length; echoes.push({ requestId, ...structuredClone(input) }); return { requestId, abandon: () => abandoned.push(requestId) }; },
    async prompt(content, mode, signal, requestId) { prompts.push({ content, mode, signal, requestId }); return prompt ? prompt(content, mode, signal, requestId) : { ok: true, value: { accepted: true } }; },
  } };
  let activeBinding = binding;
  const ctx = { uiSession: { adapter: { current } }, layout: { panelInfo },
    sessions: { binding: () => activeBinding, using: async (_id, _options, operation) => operation({ binding: activeBinding, ready: Promise.resolve() }) },
    fileUpload: { async upload(session, blob, name, signal) {
      assert.ok(blob instanceof Blob); assert.equal(blob.type, 'application/json');
      uploadSignals.push(signal);
      const raw = await blob.text(), file = { attachmentId: digest(raw), name, bytes: Buffer.byteLength(raw) };
      const value = { receiptId: 'synthetic-receipt-' + uploads.length, file };
      uploads.push({ session, raw, packet: JSON.parse(raw), name, signal }); receipts.push(value);
      return upload ? upload({ session, blob, name, signal, value }) : { ok: true, value };
    } },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input), 'http://127.0.0.1:9191/');
    assert.equal(url.pathname, '/intelligent-ui/api/state');
    assert.ok(!options?.method || options.method === 'GET');
    const session = url.searchParams.get('session'), block = url.searchParams.get('block');
    gets.push({ session, block, signal: options?.signal });
    const record = records.get(block);
    return read ? read({ session, block, signal: options?.signal, record, gets }) : new Response(JSON.stringify(record), { headers: { 'Content-Type': 'application/json' }, status: record ? 200 : 404 });
  };
  const bridge = createSessionBridge(ctx);
  t.after(() => { bridge.dispose(); globalThis.fetch = originalFetch; assert.equal(current.listenerCount, 0); assert.equal(panelInfo.listenerCount, 0); });
  return { bridge, current, panelInfo, binding, uploads, prompts, echoes, abandoned, gets, receipts, uploadSignals, replaceBinding() { activeBinding = { ...binding }; } };
}

test('same diagnostic from different old blocks and expanded views repairs the exact attached target', async t => {
  const session = 'synthetic-repair-session', blockA = '1:1:0:0', blockB = '9:1:0:0';
  const sourceA = 'root = Missing("OLD-BLOCK-A")', sourceB = 'root = Missing("OLD-BLOCK-B")';
  const gate = deferred(), records = new Map([[blockA, recordFor(session, blockA, sourceA)], [blockB, recordFor(session, blockB, sourceB)]]);
  const f = bridgeFixture(t, { records, upload: async ({ value }) => { await gate.promise; return { ok: true, value }; } });
  assert.equal(typeof f.bridge.repair, 'function');
  const inputA = inputFor(sourceA), inputB = inputFor(sourceB);
  const original = structuredClone(inputA);
  const first = f.bridge.repair(session, blockA, inputA);
  const expanded = f.bridge.repair(session, blockA, structuredClone(inputA));
  const other = f.bridge.repair(session, blockB, inputB);
  await until(() => f.uploads.length === 2);
  inputA.state.note = 'MUTATED-AFTER-CLICK';
  gate.resolve(); await Promise.all([first, expanded, other]);
  assert.equal(f.uploads.length, 2, 'inline and expanded repair of one identical target uploads only once');
  assert.equal(f.prompts.length, 2, 'distinct target blocks remain independent despite the same diagnostic');
  assert.deepEqual(f.uploads.map(upload => upload.packet.block).sort(), [blockA, blockB]);
  for (const upload of f.uploads) {
    const expected = upload.packet.block === blockA ? original : inputB;
    assert.equal(upload.session, session);
    assert.equal(upload.packet.session, session);
    assert.equal(upload.packet.sourceChunks.join(''), expected.source);
    assert.equal(upload.packet.sourceRevision, digest(expected.source));
    assert.deepEqual(JSON.parse(upload.packet.stateJsonChunks.join('')), expected.state);
    assert.equal(upload.packet.diagnosticChunks.join(''), expected.diagnostic);
  }
  for (const call of f.prompts) {
    assert.equal(call.mode, 'queue');
    assert.equal(call.content[0].type, 'text');
    assert.ok(call.content[0].text.length < 64000);
    const receipt = f.receipts.find(item => item.receiptId === call.content[1].receiptId);
    assert.ok(receipt, 'prompt uses the returned staged-upload receipt');
    assert.deepEqual(call.content[1], { type: 'file', receiptId: receipt.receiptId });
    const echo = f.echoes.find(item => item.requestId === call.requestId);
    assert.equal(echo.mode, 'queue');
    assert.equal(echo.text, call.content[0].text);
    assert.deepEqual(echo.attachments, [{ type: 'file', value: receipt.file }], 'native UI echo gets the durable file reference, not the wire receipt');
  }
  assert.equal(f.gets.length, 4, 'each distinct target is verified again before its native prompt');
  assert.deepEqual(f.abandoned, []);
});

for (const [label, pattern] of [['single-line ASCII', 'a'], ['Chinese', '汉'], ['emoji boundary pairs', 'x🌏'], ['escaped syntax', '\\"\n\t\u0000'], ['lone UTF-16 surrogates', '\ud800x\udfff']]) {
  test(`repair attachment preserves a 128000-unit source and bounded read pages: ${label}`, async t => {
    const { repairText } = await import('../src/client/host/repair.mjs');
    const source = ((label === 'emoji boundary pairs' ? 'x' : '') + pattern.repeat(Math.ceil(128000 / pattern.length))).slice(0, 128000);
    const input = { ...inputFor(source), sourceRevision: digest(source), state: { note: pattern.repeat(2000), metadata: { preserved: '汉🌏\\"\ud800' } }, diagnostic: '相同诊断-'.repeat(1000) };
    const session = 'synthetic-repair-session', block = '1:1:0:0';
    const f = bridgeFixture(t, { records: new Map([[block, recordFor(session, block, source)]]) });
    await f.bridge.repair(session, block, input);
    const packet = f.uploads[0].packet;
    assert.equal(packet.protocolVersion, protocolVersion);
    assert.equal(packet.componentsVersion, componentsVersion);
    assert.equal(packet.sourceChars, 128000);
    assert.equal(packet.sourceRevision, digest(source));
    for (const chunks of [packet.sourceChunks, packet.stateJsonChunks, packet.persistedStateJsonChunks, packet.diagnosticChunks]) {
      assert.ok(Array.isArray(chunks));
      assert.ok(chunks.every(chunk => typeof chunk === 'string' && chunk.length <= 240));
    }
    assert.equal(packet.sourceChunks.join(''), source);
    if (label === 'emoji boundary pairs') {
      assert.ok(/[\ud800-\udbff]$/.test(packet.sourceChunks[0]), 'a real surrogate pair crosses the 240-unit chunk boundary');
      assert.ok(/^[\udc00-\udfff]/.test(packet.sourceChunks[1]));
    }
    assert.deepEqual(JSON.parse(packet.stateJsonChunks.join('')), input.state);
    assert.equal(packet.diagnosticChunks.join(''), input.diagnostic.slice(0, 1200), 'diagnostics retain their existing bounded excerpt; source and state remain complete');
    const raw = JSON.stringify(packet, null, 2), lines = raw.split('\n');
    assert.equal(raw, f.uploads[0].raw, 'the inspected file is the exact native upload Blob');
    assert.ok(lines.every(line => line.length < 2000), 'JSON escapes cannot create host-truncated lines');
    assert.ok(lines.every(line => Buffer.byteLength(line) < 2000), 'multi-byte lines remain comfortably below the read cap');
    assert.ok(repairText('1:1:0:0').length < 64000, 'full source stays in the attachment, outside generic prompt text budget');
    const directory = await mkdtemp(join(tmpdir(), 'iui-repair-paged-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'repair.json'); await writeFile(path, raw);
    // Independent actual filesystem reads capped at 50 KiB, without assuming
    // that a byte page ends on a Unicode character or JSON chunk boundary.
    const file = await open(path, 'r'), pages = []; let position = 0;
    try {
      while (true) {
        const buffer = Buffer.alloc(50 * 1024), { bytesRead } = await file.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        pages.push(buffer.subarray(0, bytesRead)); position += bytesRead;
      }
    } finally { await file.close(); }
    assert.ok(pages.length > 1);
    assert.ok(pages.every(page => page.length <= 50 * 1024));
    const readBack = JSON.parse(Buffer.concat(pages).toString('utf8'));
    assert.equal(readBack.sourceChunks.join(''), source);
    assert.deepEqual(JSON.parse(readBack.stateJsonChunks.join('')), input.state);
    if (process.env.IUI_REPAIR_TARGET_EVIDENCE) {
      await mkdir(process.env.IUI_REPAIR_TARGET_EVIDENCE, { recursive: true });
      await writeFile(join(process.env.IUI_REPAIR_TARGET_EVIDENCE, `payload-${label.replaceAll(' ', '-')}.json`), JSON.stringify({ label, sourceUnits: source.length, sourceSHA256: digest(source), attachmentBytes: Buffer.byteLength(raw), attachmentSHA256: digest(raw), maxLineUnits: Math.max(...lines.map(line => line.length)), maxLineBytes: Math.max(...lines.map(line => Buffer.byteLength(line))), pageBytes: pages.map(page => page.length), roundTripExact: true, scope: 'actual filesystem byte reads capped at 50 KiB; not native filesystem tool/model validation' }, null, 2));
    }
  });
}

test('repair checks the authenticated source, hash and supported version before upload', async t => {
  const session = 'synthetic-repair-session', block = '1:1:0:0', source = 'root = Missing("TARGET")', records = new Map();
  const f = bridgeFixture(t, { records });
  for (const changes of [{ source: 'root = Missing("OTHER")' }, { sourceRevision: '0'.repeat(64) }, { protocolVersion: 99 }, { componentsVersion: 99 }, { session: 'wrong-session' }, { block: '8:1:0:0' }]) {
    records.set(block, { ...recordFor(session, block, source), ...changes });
    await assert.rejects(f.bridge.repair(session, block, inputFor(source)));
    assert.equal(f.uploads.length, 0);
    assert.equal(f.prompts.length, 0);
  }
  records.set(block, recordFor(session, block, source, 2));
  await f.bridge.repair(session, block, { ...inputFor(source), componentsVersion: 2 });
  assert.equal(f.uploads[0].packet.componentsVersion, 2, 'a supported historic target retains its component contract');
});

for (const version of [2, 3, 4]) {
  test(`fresh invalid DocumentStore repairs with complete verified saved settings: components ${version}`, async t => {
    const session = 'synthetic-repair-session', block = '1:1:0:0', source = `root = Missing("INVALID-OLD-V${version}")`;
    const saved = { note: 'PERSISTED-CURRENT', completed: true, legacy: { preserve: 117 } };
    const record = { ...recordFor(session, block, source, version), revision: 7, state: saved };
    const f = bridgeFixture(t, { records: new Map([[block, record]]) });
    let hydrationReads = 0;
    const store = new DocumentStore(session, block, { read: async () => { hydrationReads++; return record; } });
    t.after(() => store.dispose());
    store.update(source, false);
    assert.equal(store.snapshot.status, 'invalid');
    assert.equal(hydrationReads, 0, 'an invalid first render never reaches DocumentStore hydration');
    assert.deepEqual(store.snapshot.state, {}, 'saved settings are genuinely absent from the fresh local snapshot');
    const snapshot = store.getSnapshot();
    await f.bridge.repair(session, block, { source: snapshot.source, state: snapshot.state, diagnostic: snapshot.error, componentsVersion: snapshot.componentsVersion });
    const packet = f.uploads[0].packet;
    assert.equal(packet.componentsVersion, version, 'authenticated saved metadata owns the repair component version');
    assert.equal(packet.sourceRevision, digest(source));
    assert.deepEqual(JSON.parse(packet.stateJsonChunks.join('')), {});
    assert.deepEqual(JSON.parse(packet.persistedStateJsonChunks.join('')), saved);
    assert.match(packet.instructions, /persistedStateJsonChunks/);
    assert.equal(hydrationReads, 0);
    assert.deepEqual(store.snapshot.state, {});
    assert.equal(f.prompts.length, 1);
  });
}

test('repair carries local and saved settings separately with explicit local overlap precedence', async t => {
  const session = 'synthetic-repair-session', block = '1:1:0:0', source = 'root = Missing("OVERLAP")';
  const saved = { note: 'PERSISTED-CURRENT', completed: true, legacy: { preserve: 117 } };
  const local = { note: 'LOCAL-DIRTY', localOnly: ['汉🌏', '\ud800'] }, originalLocal = structuredClone(local), originalSaved = structuredClone(saved);
  const f = bridgeFixture(t, { records: new Map([[block, { ...recordFor(session, block, source, 2), revision: 9, state: saved }]]) });
  await f.bridge.repair(session, block, { ...inputFor(source), state: local });
  const packet = f.uploads[0].packet, decodedLocal = JSON.parse(packet.stateJsonChunks.join('')), decodedSaved = JSON.parse(packet.persistedStateJsonChunks.join(''));
  assert.deepEqual(decodedLocal, originalLocal);
  assert.deepEqual(decodedSaved, originalSaved);
  assert.deepEqual({ ...decodedSaved, ...decodedLocal }, { note: 'LOCAL-DIRTY', completed: true, legacy: { preserve: 117 }, localOnly: ['汉🌏', '\ud800'] }, 'independent reconstruction preserves saved-only keys and current local overlaps');
  assert.match(packet.instructions, /Preserve saved settings and apply local settings for overlapping names/);
  assert.deepEqual(local, originalLocal);
  assert.deepEqual(saved, originalSaved);
});

test('two independently valid state limits remain complete without merging into an oversized state', async t => {
  const session = 'synthetic-repair-session', block = '1:1:0:0', source = 'root = Missing("SEPARATE-LIMITS")';
  const local = stateAtLimit('local'), saved = stateAtLimit('saved');
  assert.ok(stateBytes({ ...saved, ...local }) > LIMITS.stateBytes);
  assert.throws(() => assertJSON({ ...saved, ...local }), error => error.code === 'DATA_LIMIT');
  const f = bridgeFixture(t, { records: new Map([[block, { ...recordFor(session, block, source), state: saved }]]) });
  await f.bridge.repair(session, block, { ...inputFor(source), state: local });
  const packet = f.uploads[0].packet;
  assert.deepEqual(JSON.parse(packet.stateJsonChunks.join('')), local);
  assert.deepEqual(JSON.parse(packet.persistedStateJsonChunks.join('')), saved);
  assert.ok(packet.persistedStateJsonChunks.every(chunk => chunk.length <= 240));
  assert.ok(f.uploads[0].raw.split('\n').every(line => line.length < 2000));
  assert.equal(f.prompts.length, 1);
});

test('verified saved settings retain plain JSON, key and exact byte-size guards before upload', async t => {
  const { repairSavedState } = await import('../src/client/host/repair.mjs');
  const saved = stateAtLimit('saved');
  assert.deepEqual(JSON.parse(repairSavedState(saved).join('')), saved);
  const oversized = { ...saved, savedpadding: saved.savedpadding + 'a' };
  assert.equal(stateBytes(oversized), LIMITS.stateBytes + 1);
  for (const value of [null, [], 'text', Object.create({ inherited: 1 })]) assert.throws(() => repairSavedState(value));
  const session = 'synthetic-repair-session', block = '1:1:0:0', source = 'root = Missing("INVALID-SAVED")', records = new Map();
  const f = bridgeFixture(t, { records });
  for (const [state, code] of [[oversized, 'DATA_LIMIT'], [{ metadata: { ['k'.repeat(257)]: 1 } }, 'STATE_KEY_LIMIT'], [JSON.parse('{"metadata":{"constructor":1}}'), 'UNSAFE_KEY']]) {
    assert.throws(() => repairSavedState(state), error => error.code === code);
    records.set(block, { ...recordFor(session, block, source), state });
    await assert.rejects(f.bridge.repair(session, block, inputFor(source)), error => error.code === code);
    assert.equal(f.uploads.length, 0); assert.equal(f.prompts.length, 0);
  }
});

for (const changedBy of ['saved state', 'saved revision']) {
  test(`repair rejects a ${changedBy} change during upload and retries with the latest saved snapshot`, async t => {
    const session = 'synthetic-repair-session', block = '1:1:0:0', source = 'root = Missing("SAVED-RACE")';
    const initial = { ...recordFor(session, block, source, 2), revision: 5, state: { note: 'PERSISTED-BEFORE', legacy: { preserve: 117 } } };
    const gate = deferred(), records = new Map([[block, initial]]);
    let hold = true;
    const f = bridgeFixture(t, { records, upload: async ({ value }) => { if (hold) await gate.promise; return { ok: true, value }; } });
    const input = { ...inputFor(source), state: { localOnly: true } }, pending = f.bridge.repair(session, block, input);
    const rejected = assert.rejects(pending);
    await until(() => f.uploads.length === 1);
    const current = changedBy === 'saved state' ? { ...initial, state: { ...initial.state, note: 'PERSISTED-LATEST' } } : { ...initial, revision: 6 };
    records.set(block, current); gate.resolve(); await rejected;
    assert.equal(f.prompts.length, 0); assert.equal(f.echoes.length, 0);
    assert.deepEqual(input.state, { localOnly: true });
    hold = false; await f.bridge.repair(session, block, input);
    assert.equal(f.uploads.length, 2); assert.equal(f.prompts.length, 1);
    assert.deepEqual(JSON.parse(f.uploads[1].packet.persistedStateJsonChunks.join('')), current.state);
    assert.deepEqual(JSON.parse(f.uploads[1].packet.stateJsonChunks.join('')), input.state);
  });
}

for (const failure of ['throw', 'refuse']) {
  test(`failed repair upload can retry without losing source or state: ${failure}`, async t => {
    const session = 'synthetic-repair-session', block = '1:1:0:0', source = 'root = Missing("RETRY")', input = inputFor(source), original = structuredClone(input);
    let fail = true;
    const f = bridgeFixture(t, { records: new Map([[block, recordFor(session, block, source)]]), upload: ({ value }) => {
      if (fail) { if (failure === 'throw') throw new Error('SYNTHETIC_UPLOAD_FAILURE'); return { ok: false, error: { message: 'SYNTHETIC_UPLOAD_FAILURE' } }; }
      return { ok: true, value };
    } });
    await assert.rejects(f.bridge.repair(session, block, input), /SYNTHETIC_UPLOAD_FAILURE/);
    assert.deepEqual(input, original);
    assert.equal(f.prompts.length, 0); assert.equal(f.echoes.length, 0);
    fail = false; await f.bridge.repair(session, block, input);
    assert.equal(f.uploads.length, 2); assert.equal(f.prompts.length, 1);
    assert.deepEqual(JSON.parse(f.uploads[1].packet.stateJsonChunks.join('')), original.state);
  });
}

test('native prompt refusal abandons its echo and a retry retains the complete target', async t => {
  const session = 'synthetic-repair-session', block = '1:1:0:0', source = 'root = Missing("REFUSAL")', input = inputFor(source);
  let fail = true;
  const f = bridgeFixture(t, { records: new Map([[block, recordFor(session, block, source)]]), prompt: () => fail ? { ok: false, error: { message: 'SYNTHETIC_PROMPT_REFUSAL' } } : { ok: true, value: { accepted: true } } });
  await assert.rejects(f.bridge.repair(session, block, input), /SYNTHETIC_PROMPT_REFUSAL/);
  assert.deepEqual(f.abandoned, ['repair-request-0']);
  fail = false; await f.bridge.repair(session, block, input);
  assert.equal(f.prompts.length, 2);
  assert.deepEqual(JSON.parse(f.uploads.at(-1).packet.stateJsonChunks.join('')), input.state);
  assert.equal(f.uploads.at(-1).packet.sourceChunks.join(''), source);
});

for (const cancelledBy of ['session', 'binding', 'caller signal', 'source replacement', 'component version replacement']) {
  test(`repair cancels an in-flight upload before any prompt: ${cancelledBy}`, async t => {
    const session = 'synthetic-repair-session', block = '1:1:0:0', source = 'root = Missing("CANCEL")', input = inputFor(source), original = structuredClone(input);
    const gate = deferred(), records = new Map([[block, recordFor(session, block, source)]]);
    const f = bridgeFixture(t, { records, upload: async ({ value }) => { await gate.promise; return { ok: true, value }; } });
    const controller = new AbortController(), pending = f.bridge.repair(session, block, input, { signal: controller.signal });
    const rejected = assert.rejects(pending);
    await until(() => f.uploads.length === 1);
    if (cancelledBy === 'session') f.current.set({ key: 'other-session' });
    if (cancelledBy === 'binding') f.replaceBinding();
    if (cancelledBy === 'caller signal') controller.abort(new Error('SOURCE_CHANGED'));
    if (cancelledBy === 'source replacement') records.set(block, recordFor(session, block, 'root = Missing("REPLACED")'));
    if (cancelledBy === 'component version replacement') records.set(block, recordFor(session, block, source, 2));
    gate.resolve(); await rejected;
    assert.deepEqual(input, original);
    assert.equal(f.prompts.length, 0); assert.equal(f.echoes.length, 0);
    if (cancelledBy === 'session' || cancelledBy === 'caller signal') assert.equal(f.uploadSignals[0].aborted, true);
  });
}

test('real Surface repair owns old inline/expanded targets, visible retry and source-change cancellation', { timeout: 30000 }, async t => {
  const sourceA = 'root = Missing("OLD-A")', sourceB = 'root = Missing("OLD-B")';
  const files = ['src/client/host/repair.mjs', 'src/client/host/session.mjs', 'src/client/Surface.jsx', 'src/client/document-store.mjs', 'test/repair-target.test.mjs'];
  const sourceSHA256 = Object.fromEntries(await Promise.all(files.map(async file => [file, digest(await readFile(join(root, file)))])));
  const compiled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{IntelligentSurface}from'./src/client/Surface.jsx';import{createSessionBridge}from'./src/client/host/session.mjs';import{disposeDocuments}from'./src/client/document-store.mjs';
    const current={getSnapshot:()=>({key:'synthetic-repair-session'}),subscribe:()=>()=>{}},calls=[],uploads=[],echoes=[],abandoned=[],pending=[];
    let failUpload=false,holdUpload=false;
    const binding={session:{getSnapshot:()=>({removed:false}),beginSubmission:input=>{const requestId='browser-repair-'+echoes.length;echoes.push({requestId,...input});return{requestId,abandon:()=>abandoned.push(requestId)}},prompt:async(content,mode,signal,requestId)=>{calls.push({content,mode,requestId});return{ok:true,value:{accepted:true}}}}};
    const bridge=createSessionBridge({uiSession:{adapter:{current}},layout:{panelInfo:{getSnapshot:()=>({activePanelId:null}),subscribe:()=>()=>{}}},sessions:{binding:()=>binding,using:async(_id,_opts,op)=>op({binding,ready:Promise.resolve()})},fileUpload:{upload:async(session,blob,name,signal)=>{const raw=await blob.text(),packet=JSON.parse(raw);uploads.push({session,packet,name});if(failUpload){failUpload=false;return{ok:false,error:{message:'BROWSER_UPLOAD_REFUSED'}}}if(holdUpload)await new Promise(resolve=>pending.push(resolve));if(signal.aborted)throw signal.reason;return{ok:true,value:{receiptId:'browser-receipt-'+uploads.length,file:{attachmentId:'synthetic-file-'+uploads.length,name,bytes:blob.size}}}}}});
    function Harness(){const[source,setSource]=useState(${JSON.stringify(sourceA)});window.harness={calls,uploads,echoes,abandoned,failNext:()=>{failUpload=true},hold:()=>{holdUpload=true},release:()=>{holdUpload=false;for(const resolve of pending.splice(0))resolve()},changeSource:()=>setSource(${JSON.stringify(sourceB)}),dispose:()=>{bridge.dispose();disposeDocuments()}};
      const surface=(view,block,source)=><section data-view={view}><IntelligentSurface sessionId="synthetic-repair-session" blockId={block} source={source} onRepair={(input,options)=>bridge.repair('synthetic-repair-session',block,input,options)} onSubmit={()=>{throw new Error('GENERIC_SUBMIT_MUST_NOT_REPAIR')}}/></section>;
      return <>{surface('inline','1:1:0:0',source)}{surface('expanded','1:1:0:0',source)}{surface('other','9:1:0:0',${JSON.stringify(sourceB)})}</>;
    }createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, write: false, format: 'iife', platform: 'browser' });
  const bundle = compiled.outputFiles[0].text;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  let result;
  t.after(async () => { await browser.close(); if (process.env.IUI_REPAIR_TARGET_EVIDENCE && result) await writeFile(join(process.env.IUI_REPAIR_TARGET_EVIDENCE, 'browser.json'), JSON.stringify({ ...result, cleanup: { browserClosed: !browser.isConnected(), serverOrNativeProcessesStarted: 0 } }, null, 2)); });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const savedSettings = { note: 'PERSISTED-CURRENT', completed: true, legacy: { preserve: 117 } };
  let currentA = sourceA;
  await page.route('http://127.0.0.1:9191/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/intelligent-ui/api/state') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div>' });
    const block = url.searchParams.get('block'), source = block === '1:1:0:0' ? currentA : sourceB;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...recordFor('synthetic-repair-session', block, source, block === '1:1:0:0' ? 2 : 3), state: savedSettings, revision: 7 }) });
  });
  await page.goto('http://127.0.0.1:9191/'); await page.addStyleTag({ content: await readFile(join(root, 'src/client/styles/surface.css'), 'utf8') }); await page.addScriptTag({ content: bundle });
  const inline = page.locator('[data-view="inline"]'), expanded = page.locator('[data-view="expanded"]'), other = page.locator('[data-view="other"]');
  await inline.getByRole('button', { name: '修复', exact: true }).waitFor();
  assert.equal(await inline.getByRole('alert').textContent(), await other.getByRole('alert').textContent(), 'old invalid blocks share a diagnostic');
  await page.evaluate(() => window.harness.hold());
  await inline.getByRole('button', { name: '修复', exact: true }).click();
  await expanded.getByRole('button', { name: '修复', exact: true }).click();
  await other.getByRole('button', { name: '修复', exact: true }).click();
  await page.waitForFunction(() => window.harness.uploads.length === 2);
  await page.evaluate(() => window.harness.release());
  await inline.getByRole('status').filter({ hasText: '修复请求已发送' }).waitFor();
  await other.getByRole('status').filter({ hasText: '修复请求已发送' }).waitFor();
  const initial = await page.evaluate(() => ({ uploads: window.harness.uploads, calls: window.harness.calls, echoes: window.harness.echoes }));
  assert.equal(initial.uploads.length, 2); assert.equal(initial.calls.length, 2);
  assert.deepEqual(initial.uploads.map(upload => [upload.packet.block, upload.packet.sourceChunks.join('')]).sort(), [['1:1:0:0', sourceA], ['9:1:0:0', sourceB]]);
  for (const upload of initial.uploads) {
    assert.deepEqual(JSON.parse(upload.packet.stateJsonChunks.join('')), {}, 'fresh invalid Surface genuinely has no hydrated local settings');
    assert.deepEqual(JSON.parse(upload.packet.persistedStateJsonChunks.join('')), savedSettings, 'verified saved settings remain complete even for a fresh invalid Surface');
    assert.equal(upload.packet.componentsVersion, upload.packet.block === '1:1:0:0' ? 2 : 3);
  }
  await page.evaluate(() => window.harness.failNext());
  await inline.getByRole('button', { name: '修复', exact: true }).click();
  await inline.getByRole('status').filter({ hasText: 'BROWSER_UPLOAD_REFUSED' }).waitFor();
  await inline.getByRole('button', { name: '修复', exact: true }).click();
  await inline.getByRole('status').filter({ hasText: '修复请求已发送' }).waitFor();
  assert.equal(await page.evaluate(() => window.harness.calls.length), 3);
  await page.evaluate(() => window.harness.hold());
  await inline.getByRole('button', { name: '修复', exact: true }).click();
  await page.waitForFunction(() => window.harness.uploads.length === 5);
  currentA = sourceB; await page.evaluate(() => window.harness.changeSource());
  await page.evaluate(() => window.harness.release());
  await inline.getByRole('button', { name: '修复', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.harness.calls.length), 3, 'a source switch cancels the held upload before any obsolete prompt');
  assert.equal(await inline.getByRole('status').filter({ hasText: '修复请求已发送' }).count(), 0, 'a late obsolete completion cannot announce success in the replacement source');
  assert.deepEqual(errors, []);
  for (const file of files) assert.equal(digest(await readFile(join(root, file))), sourceSHA256[file], 'source changed during test: ' + file);
  if (process.env.IUI_REPAIR_TARGET_EVIDENCE) { await mkdir(process.env.IUI_REPAIR_TARGET_EVIDENCE, { recursive: true }); await page.screenshot({ path: join(process.env.IUI_REPAIR_TARGET_EVIDENCE, 'surface-target-and-cancel.png'), fullPage: true }); }
  result = { scope: 'actual React Surface/browser with synthetic authenticated state responses, upload and native queue receipt; no DSH host/model launched', sourceSHA256, bundleSHA256: digest(bundle), initialTargets: initial.uploads.map(upload => ({ block: upload.packet.block, sourceSHA256: digest(upload.packet.sourceChunks.join('')), componentsVersion: upload.packet.componentsVersion, localState: JSON.parse(upload.packet.stateJsonChunks.join('')), persistedState: JSON.parse(upload.packet.persistedStateJsonChunks.join('')) })), promptCalls: await page.evaluate(() => window.harness.calls.length), errors, uploadFailureRetryPassed: true, sourceChangeCancelled: true };
  await page.evaluate(() => window.harness.dispose());
});
