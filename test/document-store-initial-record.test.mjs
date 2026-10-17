import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStore, sourceHash } from '../src/client/document-store.mjs';

const source = 'root = Counter("人数","people",4,1,12)';
const nextSource = 'root = Counter("替换","people",2,1,12)';
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const ready = async store => { for (let i = 0; i < 30 && store.snapshot.status === 'loading'; i++) await flush(); assert.notEqual(store.snapshot.status, 'loading'); };
const record = async patch => ({ session: 'seeded-session', block: '1:1:0:0', protocolVersion: 1, source, sourceRevision: await sourceHash(source), revision: 7, componentsVersion: 2, state: { people: 7 }, ...patch });

test('a complete initial record hydrates once, retains its legacy contract and saves from the supplied CAS revision', async t => {
  let reads = 0, posted;
  const initialRecord = await record();
  const store = new DocumentStore(initialRecord.session, initialRecord.block, { read: async (_s, _b, input) => {
    if (!input) { reads++; return initialRecord; }
    posted = input; return { ...initialRecord, state: input.state, revision: 8 };
  } }); t.after(() => store.dispose());
  store.update(source, false, { initialRecord }); await ready(store);
  assert.equal(reads, 0);
  assert.equal(store.snapshot.state.people, 7); assert.equal(store.snapshot.componentsVersion, 2);
  store.set('people', 8); await store.save();
  assert.equal(posted.expectedRevision, 7); assert.equal(store.revision, 8);
  assert.equal(store.snapshot.state.people, 8); assert.equal(store.snapshot.componentsVersion, 2);
});

for (const mismatch of ['session', 'block', 'source', 'sourceRevision', 'revision', 'state', 'componentsVersion']) {
  test(`an invalid initial record (${mismatch}) preserves an unread journal until an explicit successful retry`, async t => {
    const initialRecord = await record(), raw = JSON.stringify({ source, state: { people: 9 }, dirty: ['people'], revision: 7, componentsVersion: 2 });
    const data = new Map(), old = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } });
    t.after(() => { if (old) Object.defineProperty(globalThis, 'sessionStorage', old); else delete globalThis.sessionStorage; });
    let reads = 0;
    const store = new DocumentStore(initialRecord.session, initialRecord.block, { read: async () => { reads++; return initialRecord; } });
    t.after(() => store.dispose());
    const key = store.journalKey(source); data.set(key, raw);
    const bad = { session: 'other-session', block: '9:1:0:0', source: nextSource, sourceRevision: 'bad-hash', revision: -1, state: [], componentsVersion: 99 };
    store.update(source, false, { initialRecord: { ...initialRecord, [mismatch]: bad[mismatch] } }); await ready(store);
    assert.equal(store.snapshot.status, 'load-error'); assert.equal(reads, 0, 'an invalid seed does not silently fall back to another request');
    store.writeJournal(); assert.equal(data.get(key), raw);
    store.update(source, false, { reload: true }); await ready(store);
    assert.equal(reads, 1); assert.equal(store.snapshot.state.people, 9); assert.ok(store.dirty.has('people'));
    store.dispose(); assert.equal(JSON.parse(data.get(key)).state.people, 9);
  });
}

test('hash-delayed seed hydration preserves later local edits and snapshots caller-owned state', async t => {
  const initialRecord = await record({ state: { people: 7, untouched: 'approved' } }); let release;
  const hashing = new Promise(resolve => { release = resolve; });
  const store = new DocumentStore(initialRecord.session, initialRecord.block, { read: async () => { throw Error('unexpected GET'); }, hash: () => hashing });
  t.after(() => store.dispose());
  store.update(source, false, { initialRecord }); store.set('people', 10); initialRecord.state.people = 11; initialRecord.state.untouched = 'mutated';
  release(await sourceHash(source)); await ready(store);
  assert.equal(store.snapshot.state.people, 10); assert.ok(store.dirty.has('people')); assert.equal(store.revision, 7);
  assert.equal(store.snapshot.state.untouched, 'approved', 'later caller mutations cannot change the accepted seed');
});

test('a seed completing after a source change cannot replace the new source or its edits', async t => {
  const initialRecord = await record(); let release;
  const hashing = new Promise(resolve => { release = resolve; });
  const store = new DocumentStore(initialRecord.session, initialRecord.block, { hash: value => value === source ? hashing : sourceHash(value), read: async () => record({ source: nextSource, sourceRevision: await sourceHash(nextSource), revision: 0, componentsVersion: 4, state: {} }) });
  t.after(() => store.dispose());
  store.update(source, false, { initialRecord }); store.update(nextSource, false); await ready(store);
  store.set('people', 3); release(await sourceHash(source)); await flush();
  assert.equal(store.snapshot.source, nextSource); assert.equal(store.snapshot.state.people, 3); assert.equal(store.revision, 0); assert.equal(store.snapshot.componentsVersion, 4);
});

test('an already hydrated store ignores a later seed instead of rolling back its revision or local edits', async t => {
  const initialRecord = await record(); let reads = 0;
  const store = new DocumentStore(initialRecord.session, initialRecord.block, { read: async () => { reads++; return { ...initialRecord, revision: 8, state: { people: 8 } }; } });
  t.after(() => store.dispose());
  store.update(source, false); await ready(store); store.set('people', 9);
  store.update(source, false, { initialRecord }); await flush();
  assert.equal(reads, 1); assert.equal(store.revision, 8); assert.equal(store.snapshot.state.people, 9); assert.ok(store.dirty.has('people'));
});
