import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DocumentStore } from '../src/client/document-store.mjs';
import { protocolVersion, componentsVersion } from '../src/protocol/version.mjs';

const source = 'root = Input("验收", "value", "初始")';
const sourceRevision = createHash('sha256').update(source).digest('hex');
const block = '1:1:0:0';
const initial = () => ({protocolVersion, componentsVersion, revision: 0, sourceRevision, source, state: {}, persisted: false});
const receipt = input => ({protocolVersion, componentsVersion, session: input.session, block: input.block,
  revision: input.expectedRevision + 1, sourceRevision: input.sourceRevision, source: input.source, state: input.state});
const response = value => new Response(JSON.stringify(value), {status: 200, headers: {'Content-Type': 'application/json'}});

function journal(t) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', {configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }});
  t.after(() => {if (old) Object.defineProperty(globalThis, 'sessionStorage', old); else delete globalThis.sessionStorage;});
  return values;
}

async function hydrated(store) {
  store.update(source, false);
  for (let i = 0; i < 100 && store.snapshot.status === 'loading'; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(store.snapshot.status, 'default');
}

const malformed = {
  'empty object': () => ({}),
  'JSON error object': () => ({error: 'backend was not activated'}),
  'foreign session': value => ({...value, session: 'someone-else'}),
  'foreign block': value => ({...value, block: '2:1:0:0'}),
  'missing revision': value => {const copy = {...value}; delete copy.revision; return copy;},
  'default revision': value => ({...value, revision: 0}),
  'unsafe revision': value => ({...value, revision: Number.MAX_SAFE_INTEGER + 1}),
  'foreign source': value => ({...value, source: 'root = Text("另一个作品")'}),
  'foreign source revision': value => ({...value, sourceRevision: '0'.repeat(64)}),
  'unknown protocol': value => ({...value, protocolVersion: protocolVersion + 100}),
  'unknown components': value => ({...value, componentsVersion: componentsVersion + 100}),
  'missing state': value => {const copy = {...value}; delete copy.state; return copy;},
  'non-object state': value => ({...value, state: []}),
  'unpersisted receipt': value => ({...value, persisted: false}),
  'different acknowledged value': value => ({...value, state: {value: '不是已提交的中文'}}),
};

test('malformed HTTP 200 write receipts cannot acknowledge or discard the user draft', async t => {
  for (const [name, mutate] of Object.entries(malformed)) await t.test(name, async t => {
    const values = journal(t);
    let post;
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      if (options?.method !== 'POST') return response(initial());
      post = JSON.parse(options.body);
      return response(mutate(receipt(post)));
    });
    const store = new DocumentStore('owned-session', block, {hash: async () => sourceRevision});
    t.after(() => store.dispose());
    await hydrated(store);
    store.set('value', '保留中文草稿');
    assert.equal(values.size, 1);
    await store.save();
    assert.equal(post.state.value, '保留中文草稿');
    assert.equal(store.snapshot.status, 'save-error');
    assert.equal(store.state.value, '保留中文草稿');
    assert.equal(store.revision, 0);
    assert.ok(store.dirty.has('value'));
    assert.equal(values.size, 1);
    assert.equal(JSON.parse([...values.values()][0]).state.value, '保留中文草稿');
  });
});

test('default GET without identity and valid persisted write receipt remain compatible', async t => {
  const values = journal(t);
  t.mock.method(globalThis, 'fetch', async (_url, options) => options?.method === 'POST'
    ? response(receipt(JSON.parse(options.body))) : response(initial()));
  const store = new DocumentStore('owned-session', block, {hash: async () => sourceRevision});
  t.after(() => store.dispose());
  await hydrated(store);
  store.set('value', '真实回执对应中文');
  await store.save();
  assert.equal(store.snapshot.status, 'saved');
  assert.equal(store.revision, 1);
  assert.equal(store.state.value, '真实回执对应中文');
  assert.equal(store.dirty.size, 0);
  assert.equal(values.size, 0);
});

test('legacy component version omission and reordered JSON state keys can still acknowledge', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options?.method !== 'POST') return response({...initial(), componentsVersion: 1});
    const value = receipt(JSON.parse(options.body));
    delete value.componentsVersion;
    value.state = Object.fromEntries(Object.entries(value.state).reverse());
    return response(value);
  });
  const store = new DocumentStore('owned-session', block, {hash: async () => sourceRevision});
  t.after(() => store.dispose());
  await hydrated(store);
  store.set('value', '旧组件与语义一致');
  store.set('another', {b: '乙', a: '甲'});
  await store.save();
  assert.equal(store.snapshot.status, 'saved');
  assert.equal(store.revision, 1);
  assert.equal(store.dirty.size, 0);
});

test('current-source default projection keeps previous persisted revision for CAS without identity', async t => {
  const values = journal(t);
  let expectedRevision;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options?.method !== 'POST') return response({...initial(), revision: 7});
    const input = JSON.parse(options.body);
    expectedRevision = input.expectedRevision;
    return response(receipt(input));
  });
  const store = new DocumentStore('owned-session', block, {hash: async () => sourceRevision});
  t.after(() => store.dispose());
  await hydrated(store);
  assert.equal(store.revision, 7);
  store.set('value', '新源文默认值上继续编辑');
  await store.save();
  assert.equal(expectedRevision, 7);
  assert.equal(store.revision, 8);
  assert.equal(store.snapshot.status, 'saved');
  assert.equal(values.size, 0);
});

test('fresh service default record without persisted flag is a valid unsaved default', async t => {
  const record = initial();
  delete record.persisted;
  t.mock.method(globalThis, 'fetch', async () => response(record));
  const store = new DocumentStore('owned-session', block, {hash: async () => sourceRevision});
  t.after(() => store.dispose());
  await hydrated(store);
  assert.equal(store.revision, 0);
  assert.equal(store.snapshot.status, 'default');
});

test('invalid HTTP 409 records keep the draft and recover through an authoritative GET', async t => {
  const invalid = {
    'partial record': () => ({sourceRevision}),
    'foreign session': value => ({...value, session: 'foreign-session'}),
    'foreign block': value => ({...value, block: 'foreign-block'}),
    'unknown protocol': value => ({...value, protocolVersion: 100}),
    'unsafe revision': value => ({...value, revision: Number.MAX_SAFE_INTEGER + 1}),
    'unpersisted projection': value => ({...value, persisted: false}),
    'missing state': value => {const copy = {...value}; delete copy.state; return copy;},
    'mismatched source hash': value => ({...value, source: 'root = Text("外来作品")'}),
  };
  for (const [name, mutate] of Object.entries(invalid)) await t.test(name, async t => {
    const values = journal(t);
    let reads = 0, posts = 0, accepted;
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      if (options?.method !== 'POST') {
        reads++;
        return response(reads === 1 ? initial() : {...receipt({session: 'owned-session', block, source, sourceRevision,
          expectedRevision: 2, state: {value: '另一窗口的值', untouched: '可信原设置'}})});
      }
      const input = JSON.parse(options.body);
      if (++posts === 1) return new Response(JSON.stringify({error: 'State revision conflict',
        record: mutate({...receipt(input), state: {value: '外来值', untouched: '不应被采用'}})}), {status: 409});
      accepted = input;
      return response(receipt(input));
    });
    const store = new DocumentStore('owned-session', block, {hash: async () => sourceRevision});
    t.after(() => store.dispose());
    await hydrated(store);
    store.set('value', '保留自己的中文');
    await store.save();
    assert.equal(store.snapshot.status, 'save-error');
    assert.equal(store.revision, 0);
    assert.equal(store.conflictRecord, null);
    assert.equal(store.reloadBeforeSave, true);
    assert.equal(store.state.value, '保留自己的中文');
    assert.ok(store.dirty.has('value'));
    assert.equal(values.size, 1);
    await store.save();
    assert.equal(reads, 2);
    assert.equal(store.snapshot.status, 'conflict');
    await store.save({resolveConflict: true});
    assert.equal(accepted.expectedRevision, 3);
    assert.deepEqual(accepted.state, {value: '保留自己的中文', untouched: '可信原设置'});
    assert.equal(store.snapshot.status, 'saved');
    assert.equal(store.revision, 4);
    assert.equal(store.dirty.size, 0);
    assert.equal(values.size, 0);
  });
});

test('a valid HTTP 409 record supports confirmation while preserving the other window settings', async t => {
  const values = journal(t);
  let posts = 0, accepted;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options?.method !== 'POST') return response(initial());
    const input = JSON.parse(options.body);
    if (++posts === 1) return new Response(JSON.stringify({error: 'State revision conflict',
      record: {...receipt(input), state: {value: '另一窗口的值', untouched: '同一作品的设置'}}}), {status: 409});
    accepted = input;
    return response(receipt(input));
  });
  const store = new DocumentStore('owned-session', block, {hash: async () => sourceRevision});
  t.after(() => store.dispose());
  await hydrated(store);
  store.set('value', '保留自己的中文');
  await store.save();
  assert.equal(store.snapshot.status, 'conflict');
  assert.equal(store.revision, 1);
  assert.equal(values.size, 1);
  await store.save({resolveConflict: true});
  assert.equal(accepted.expectedRevision, 1);
  assert.deepEqual(accepted.state, {value: '保留自己的中文', untouched: '同一作品的设置'});
  assert.equal(store.snapshot.status, 'saved');
  assert.equal(values.size, 0);
});

test('a nonempty unpersisted projection cannot retire a draft through GET or Pane initialRecord', async t => {
  for (const ingress of ['GET', 'initialRecord']) await t.test(ingress, async t => {
    const values = journal(t);
    const session = 'projection-' + ingress;
    const projection = {...initial(), revision: 8, state: {value: '尚未保存的中文'}};
    let posts = 0;
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      if (options?.method === 'POST') posts++;
      return response(projection);
    });
    const store = new DocumentStore(session, block);
    const key = store.journalKey(source);
    const raw = JSON.stringify({source, state: {value: '尚未保存的中文'}, dirty: ['value'], revision: 7,
      conflict: false, componentsVersion});
    values.set(key, raw);
    store.update(source, false, ingress === 'initialRecord'
      ? {initialRecord: {...projection, session, block}} : {});
    for (let i = 0; i < 100 && store.snapshot.status === 'loading'; i++) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(store.snapshot.status, 'load-error');
    store.dispose();
    assert.equal(values.get(key), raw);
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      if (options?.method === 'POST') posts++;
      return response({...initial(), revision: 8});
    });
    const reopened = new DocumentStore(session, block);
    t.after(() => reopened.dispose());
    reopened.update(source, false);
    for (let i = 0; i < 100 && reopened.snapshot.status === 'loading'; i++) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(reopened.state.value, '尚未保存的中文');
    assert.ok(reopened.dirty.has('value'));
    assert.equal(reopened.revision, 8);
    assert.equal(reopened.snapshot.status, 'conflict');
    reopened.dispose();
    assert.ok(values.has(key));
    assert.equal(posts, 0);
  });
});

test('a truthful empty unpersisted projection cannot acknowledge a draft equal to the author default', async t => {
  const values = journal(t);
  let posts = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options?.method === 'POST') posts++;
    return response({...initial(), revision: 8});
  });
  const store = new DocumentStore('projection-default-draft', block);
  t.after(() => store.dispose());
  const key = store.journalKey(source);
  values.set(key, JSON.stringify({source, state: {value: '初始'}, dirty: ['value'], revision: 7,
    conflict: false, componentsVersion}));
  store.update(source, false);
  for (let i = 0; i < 100 && store.snapshot.status === 'loading'; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.ok(store.dirty.has('value'));
  assert.equal(store.state.value, '初始');
  assert.equal(store.revision, 8);
  assert.equal(store.snapshot.status, 'conflict');
  store.dispose();
  assert.ok(values.has(key));
  assert.equal(posts, 0);
});

test('Pane fresh-default seeds without a persisted flag retain the same unpersisted semantics as GET', async t => {
  for (const withDraft of [false, true]) await t.test(withDraft ? 'matching author-default draft' : 'fresh default', async t => {
    const values = journal(t);
    const session = 'fresh-pane-' + withDraft;
    const store = new DocumentStore(session, block, {read: async () => {throw new Error('unexpected duplicate GET');}});
    t.after(() => store.dispose());
    const key = store.journalKey(source);
    if (withDraft) values.set(key, JSON.stringify({source, state: {value: '初始'}, dirty: ['value'], revision: 0,
      conflict: false, componentsVersion}));
    const seed = {...initial(), session, block};
    delete seed.persisted;
    store.update(source, false, {initialRecord: seed});
    for (let i = 0; i < 100 && store.snapshot.status === 'loading'; i++) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(store.revision, 0);
    assert.equal(store.snapshot.status, withDraft ? 'unsaved' : 'default');
    assert.equal(store.dirty.has('value'), withDraft);
    store.dispose();
    assert.equal(values.has(key), withDraft);
  });
});
