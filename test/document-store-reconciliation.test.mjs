import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStore } from '../src/client/document-store.mjs';

const source = 'root = Stack([Input("x","x","zero"),Input("y","y","zero"),Input("z","z","zero")])';
const columnsSource = '$a = 1\n$b = 1\nroot = Grid([Text("content")], $a + $b)';
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function ready(store, text = source, status = 'saved') {
  store.update(text, false);
  for (let i = 0; i < 50 && store.snapshot.status === 'loading'; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.snapshot.status, status, store.snapshot.error);
}
function fixture(t, initial = {}) {
  const data = new Map(), original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  } });
  let remote = { revision: 1, sourceRevision: 'hash', componentsVersion: 4, state: initial }, held;
  const writes = [];
  const options = { hash: async () => 'hash', read: async (_s, _b, input) => {
    if (!input) return structuredClone(remote);
    if (input.expectedRevision !== remote.revision) throw Object.assign(new Error('conflict'), { status: 409, record: structuredClone(remote) });
    writes.push(structuredClone(input));
    remote = { ...input, revision: remote.revision + 1, componentsVersion: 4 };
    const receipt = structuredClone(remote);
    await held?.promise;
    return receipt;
  } };
  const stores = [], make = () => {
    const store = new DocumentStore('reconciliation', '1:1:0:0', options);
    stores.push(store); return store;
  }, store = make();
  t.after(() => {
    held?.resolve(); stores.forEach(store => store.dispose());
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  });
  return { store, make, data, writes, remote: () => remote,
    external(state) { remote = { ...remote, revision: remote.revision + 1, state }; },
    hold() { held = deferred(); return () => { held.resolve(); held = undefined; }; },
  };
}

for (const edit of ['set', 'reset', 'action', 'widget']) {
  test(`a delayed conflict receipt retains an explicit same-value ${edit} and untouched remote fields`, async t => {
    const f = fixture(t), { store } = f;
    await ready(store);
    const path = 'root.0.0';
    if (edit === 'widget') { store.setWidget(path, { selected: 0 }); await store.save(); }
    const key = edit === 'widget' ? Object.keys(store.state).find(name => name.startsWith('@iui-widget:')) : 'x';
    f.external({ ...store.state, [key]: edit === 'widget' ? { selected: 1 } : 'remote-x', z: 'remote-z' });
    store.set('y', 'local-y'); await store.save();
    assert.equal(store.snapshot.status, 'conflict');
    const release = f.hold(), saving = store.save({ resolveConflict: true });
    if (edit === 'widget') store.setWidget(path, { selected: 0 });
    else if (edit === 'action') store.action({ type: 'set', name: 'x', value: 'zero' });
    else if (edit === 'reset') store.reset('x');
    else store.set('x', 'zero');
    release(); await saving;
    const expected = edit === 'widget' ? { selected: 0 } : 'zero';
    assert.deepEqual(store.state[key], expected, 'an explicit edit is not inferred from a value difference');
    assert.equal(store.state.z, 'remote-z'); assert.equal(store.state.y, 'local-y');
    assert.deepEqual([...store.dirty], [key]);
    assert.deepEqual(JSON.parse(f.data.get(store.journalKey(source))).state[key], expected);
    await store.save();
    assert.deepEqual(f.remote().state[key], expected); assert.equal(f.remote().state.z, 'remote-z');
    assert.equal(store.snapshot.status, 'saved'); assert.equal(f.data.size, 0);
  });
}

test('recovery acknowledges equal JSON objects independently of property order', async t => {
  const f = fixture(t, { settings: { nested: { b: 2, a: 1 }, list: [1, null] } }), { store } = f;
  f.data.set(store.journalKey(source), JSON.stringify({ source, state: { settings: { list: [1, null], nested: { a: 1, b: 2 } } }, dirty: ['settings'], revision: 0 }));
  await ready(store);
  assert.equal(store.snapshot.status, 'saved'); assert.equal(store.dirty.size, 0);
  store.writeJournal(); assert.equal(f.data.size, 0); assert.equal(f.writes.length, 0);
});

test('a receipt acknowledges an equivalent reordered edit without scheduling another write', async t => {
  const f = fixture(t), { store } = f;
  await ready(store);
  store.set('settings', { a: 1, b: 2 });
  const release = f.hold(), saving = store.save();
  store.set('settings', { b: 2, a: 1 });
  release(); await saving;
  assert.equal(store.snapshot.status, 'saved'); assert.equal(store.dirty.size, 0);
  await store.save(); assert.equal(f.writes.length, 1);
});

test('an older journal cannot replace a newer in-memory edit during delayed hydration', async t => {
  const f = fixture(t), { store } = f, hashing = deferred();
  f.data.set(store.journalKey(source), JSON.stringify({ source, state: { x: 'older-draft' }, dirty: ['x'], revision: 1 }));
  store.hash = () => hashing.promise;
  store.update(source, false);
  t.mock.method(globalThis.sessionStorage, 'setItem', () => { throw Error('synthetic quota failure'); });
  store.set('x', 'latest-edit');
  hashing.resolve('hash');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.sourceRevision, 'hash');
  assert.equal(store.state.x, 'latest-edit'); assert.ok(store.dirty.has('x'));
  await store.save(); assert.equal(f.remote().state.x, 'latest-edit');
});

test('conflict resolution validates combined settings before sending or consuming a draft', async t => {
  const f = fixture(t), { store } = f;
  await ready(store, columnsSource);
  store.set('b', 5); f.external({ a: 5, b: 1 }); await store.save();
  assert.equal(store.snapshot.status, 'conflict');
  const before = store.snapshot.tree;
  await store.save({ resolveConflict: true });
  assert.equal(f.writes.length, 0, 'individually valid edits must not persist an invalid combination');
  assert.equal(store.snapshot.status, 'conflict'); assert.match(store.snapshot.error, /Grid/);
  assert.equal(store.snapshot.tree, before); assert.equal(store.state.b, 5);
  assert.ok(store.dirty.has('b')); assert.equal(f.remote().state.b, 1);
  store.set('b', 1); await store.save({ resolveConflict: true });
  assert.equal(store.snapshot.status, 'saved'); assert.equal(store.snapshot.tree.props.columns, 6);
  assert.equal(f.remote().state.a, 5); assert.equal(f.writes.length, 1);
});

test('a valid receipt incompatible with a later edit preserves the usable draft for explicit resolution', async t => {
  const f = fixture(t), { store } = f;
  await ready(store, columnsSource);
  store.set('b', 2); f.external({ a: 4, b: 1 }); await store.save();
  const release = f.hold(), saving = store.save({ resolveConflict: true });
  store.set('b', 3); const before = store.snapshot.tree;
  release(); await saving;
  assert.equal(store.snapshot.status, 'conflict'); assert.equal(store.snapshot.tree, before);
  assert.equal(store.state.a, 1); assert.equal(store.state.b, 3); assert.ok(store.dirty.has('b'));
  assert.equal(store.revision, f.remote().revision); assert.equal(f.remote().state.b, 2);
  assert.equal(JSON.parse(f.data.get(store.journalKey(columnsSource))).state.b, 3);
  store.dispose();
  const restored = f.make(); await ready(restored, columnsSource, 'conflict');
  assert.equal(restored.state.a, 1); assert.equal(restored.state.b, 3);
  assert.equal(restored.snapshot.tree.props.columns, 4);
  restored.set('b', 1); await restored.save({ resolveConflict: true });
  assert.equal(restored.snapshot.status, 'saved'); assert.equal(restored.snapshot.tree.props.columns, 5);
  assert.deepEqual(f.remote().state, { a: 4, b: 1 });
});
