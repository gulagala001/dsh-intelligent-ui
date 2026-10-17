import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DocumentStore, acquireDocument, disposeDocuments, sourceHash } from '../src/client/document-store.mjs';
import { componentsVersion, protocolVersion } from '../src/protocol/version.mjs';

const sourceA = 'root = Input("x","x","A-default")';
const sourceB = 'root = Input("x","x","B-default")';
const sourceC = 'root = Input("x","x","C-default")';
const digest = source => createHash('sha256').update(source).digest('hex');
const sourceVersions = new Map([[sourceA, 2], [sourceB, componentsVersion], [sourceC, 3]]);
const block = '1:1:0:0';
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const hydrated = async store => {
  const deadline = Date.now() + 2000;
  while (store.getSnapshot().status === 'loading' && Date.now() < deadline) await flush();
  assert.notEqual(store.getSnapshot().status, 'loading', 'real source hashing and hydration must settle');
};

function environment(t, { quota = false } = {}) {
  const data = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { if (typeof quota === 'function' ? quota() : quota) throw new Error('synthetic quota failure'); data.set(key, value); },
    removeItem: key => data.delete(key),
  } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => {
    disposeDocuments();
    t.mock.timers.reset();
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  });
  return data;
}

function documentFixture(t, session = 'draft-lifecycle') {
  let currentSource = sourceA;
  const offline = new Set(), writesOffline = new Set();
  const records = new Map([...sourceVersions].map(([source, version]) =>
    [source, { revision: 0, sourceRevision: digest(source), componentsVersion: version, state: {} }]));
  const read = async (_session, _block, input) => {
    if (!input) {
      if (offline.has(currentSource)) throw Object.assign(new Error('synthetic offline read'), { status: 503 });
      return structuredClone(records.get(currentSource));
    }
    if (writesOffline.has(input.source)) throw Object.assign(new Error('synthetic offline write'), { status: 503 });
    const previous = records.get(input.source);
    const next = { ...input, revision: previous.revision + 1, componentsVersion: previous.componentsVersion };
    records.set(input.source, next);
    return structuredClone(next);
  };
  return {
    offline, writesOffline, records, read,
    make() {
      const store = new DocumentStore(session, block, { read, hash: sourceHash });
      t.after(() => store.dispose());
      return store;
    },
    async show(store, source) {
      currentSource = source;
      store.update(source, false);
      await hydrated(store);
    },
  };
}

async function backedReadFailure(t, session) {
  const data = environment(t), fixture = documentFixture(t, session);
  fixture.writesOffline.add(sourceA);
  const original = acquireDocument(session, block);
  original.store.request = fixture.read;
  await fixture.show(original.store, sourceA);
  original.store.set('x', 'IMPORTANT-BACKED-A');
  await original.store.save();
  assert.equal(original.store.getSnapshot().status, 'save-error');
  const key = original.store.journalKey(sourceA), raw = data.get(key);
  assert.equal(JSON.parse(raw).state.x, 'IMPORTANT-BACKED-A');
  original.release(); disposeDocuments();
  assert.equal(data.get(key), raw, 'the original failed write leaves its backup intact');
  fixture.offline.add(sourceA);
  const reopened = acquireDocument(session, block);
  reopened.store.request = fixture.read;
  await fixture.show(reopened.store, sourceA);
  assert.equal(reopened.store.getSnapshot().status, 'load-error');
  assert.equal(reopened.store.getSnapshot().state.x, 'A-default');
  assert.deepEqual([...reopened.store.dirty], [], 'the backup has not yet been hydrated into memory');
  return { data, fixture, key, raw, reopened };
}

for (const cleanup of ['release-and-evict', 'dispose']) {
  test(`a backed draft survives failed hydration followed by ${cleanup}`, async t => {
    const session = 'failed-read-' + cleanup;
    const { data, fixture, key, raw, reopened } = await backedReadFailure(t, session);
    if (cleanup === 'dispose') disposeDocuments();
    else {
      reopened.release();
      assert.equal(data.get(key), raw, 'releasing a default-state view cannot acknowledge an unread backup');
      t.mock.timers.tick(30001); await flush();
    }
    assert.equal(reopened.store.disposed, true, 'a backed unhydrated draft does not retain the entire store indefinitely');
    assert.equal(data.get(key), raw, 'cleanup preserves the exact source-scoped backup bytes');
    fixture.offline.delete(sourceA);
    const recovered = acquireDocument(session, block);
    recovered.store.request = fixture.read;
    await fixture.show(recovered.store, sourceA);
    assert.equal(recovered.store.getSnapshot().state.x, 'IMPORTANT-BACKED-A');
    recovered.release();
  });
}

test('switching sources after failed hydration and release keeps the unread A draft through a B save', async t => {
  const session = 'failed-read-source-switch';
  const { data, fixture, key, raw, reopened } = await backedReadFailure(t, session);
  reopened.release();
  const switched = acquireDocument(session, block);
  switched.store.request = fixture.read;
  await fixture.show(switched.store, sourceB);
  assert.equal(switched.store.getSnapshot().state.x, 'B-default');
  switched.store.set('x', 'DURABLE-B'); await switched.store.save();
  assert.equal(fixture.records.get(sourceB).state.x, 'DURABLE-B');
  assert.equal(data.get(key), raw, 'saving B cannot consume a draft A never read');
  fixture.offline.delete(sourceA);
  await fixture.show(switched.store, sourceA);
  assert.equal(switched.store.getSnapshot().state.x, 'IMPORTANT-BACKED-A');
  assert.equal(switched.store.getSnapshot().componentsVersion, 2);
  switched.release();
});

test('retrying a failed same-source read restores the backed draft and removes it only after save confirmation', async t => {
  const session = 'failed-read-retry';
  const { data, fixture, key, raw, reopened } = await backedReadFailure(t, session);
  reopened.release();
  const active = acquireDocument(session, block), store = active.store;
  store.request = fixture.read;
  store.update(sourceA, false, { reload: true }); await hydrated(store);
  assert.equal(store.getSnapshot().status, 'load-error');
  assert.equal(data.get(key), raw, 'another failed retry preserves the unread backup');
  fixture.offline.delete(sourceA);
  store.update(sourceA, false, { reload: true }); await hydrated(store);
  assert.equal(store.getSnapshot().status, 'unsaved');
  assert.equal(store.getSnapshot().state.x, 'IMPORTANT-BACKED-A');
  assert.equal(data.get(key), raw, 'reading remote defaults cannot acknowledge different local settings');
  fixture.writesOffline.delete(sourceA);
  await store.save();
  assert.equal(store.getSnapshot().status, 'saved');
  assert.equal(fixture.records.get(sourceA).state.x, 'IMPORTANT-BACKED-A');
  assert.equal(data.has(key), false, 'an actual successful write may retire the restored backup');
  active.release();
});

async function cacheFixture(t, { delayedWrite = false } = {}) {
  let currentSource = sourceA;
  let revision = 0;
  const receipt = deferred();
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options.method === 'POST') {
      const input = JSON.parse(options.body);
      if (delayedWrite) await receipt.promise;
      return { ok: true, status: 200, json: async () => ({ ...input, revision: ++revision, protocolVersion, componentsVersion }) };
    }
    return { ok: true, status: 200, json: async () => ({ revision, source: currentSource, sourceRevision: await sourceHash(currentSource), protocolVersion, componentsVersion: sourceVersions.get(currentSource), state: {}, persisted: false }) };
  });
  return {
    receipt,
    async show(store, source = sourceA) {
      currentSource = source;
      store.update(source, false);
      await hydrated(store);
      assert.ok(['default', 'saved', 'unsaved', 'conflict'].includes(store.getSnapshot().status), store.getSnapshot().error);
    },
  };
}

test('editing and saving B leaves the unsaved A draft available when returning to A', async t => {
  environment(t);
  const fixture = documentFixture(t), store = fixture.make();
  await fixture.show(store, sourceA);
  store.set('x', 'UNSAVED-A');
  await fixture.show(store, sourceB);
  assert.equal(store.getSnapshot().state.x, 'B-default', 'A settings do not enter B');
  store.set('x', 'SAVED-B');
  await store.save();
  assert.equal(fixture.records.get(sourceB).state.x, 'SAVED-B');
  await fixture.show(store, sourceA);
  assert.equal(store.getSnapshot().state.x, 'UNSAVED-A', 'saving B must not erase A settings');
});

test('closing and rebuilding a store restores A after B has been edited and saved', async t => {
  environment(t);
  const fixture = documentFixture(t), first = fixture.make();
  await fixture.show(first, sourceA);
  first.set('x', 'REFRESH-A');
  await fixture.show(first, sourceB);
  first.set('x', 'REFRESH-B');
  await first.save();
  first.dispose();
  const reopened = fixture.make();
  await fixture.show(reopened, sourceA);
  assert.equal(reopened.getSnapshot().state.x, 'REFRESH-A');
  const reopenedB = fixture.make();
  await fixture.show(reopenedB, sourceB);
  assert.equal(reopenedB.getSnapshot().state.x, 'REFRESH-B', 'B still restores its durable state');
});

test('a successful old-source backup remains exportable with its original components version', async t => {
  environment(t);
  const fixture = documentFixture(t), store = fixture.make();
  await fixture.show(store, sourceA);
  store.set('x', 'EXPORT-A');
  await fixture.show(store, sourceB);
  const draft = store.getSnapshot().previousDraft;
  assert.ok(draft, 'changing source exposes the outgoing unsaved draft');
  assert.equal(draft.source, sourceA);
  assert.equal(draft.state.x, 'EXPORT-A');
  assert.equal(draft.componentsVersion, 2);
});

test('clean B neither removes a foreign v1 draft nor imports its settings', async t => {
  const data = environment(t), session = 'legacy-foreign';
  const legacyKey = `dsh-iui.draft.v1:${session}:${block}`;
  const raw = JSON.stringify({ source: sourceA, state: { x: 'LEGACY-A' }, dirty: ['x'], revision: 0, conflict: false });
  data.set(legacyKey, raw);
  const fixture = documentFixture(t, session), clean = fixture.make();
  await fixture.show(clean, sourceB);
  assert.equal(clean.getSnapshot().state.x, 'B-default');
  await clean.save();
  clean.dispose();
  assert.equal(data.get(legacyKey), raw, 'an unrelated clean source cannot delete a v1 backup');
  const restored = fixture.make();
  await fixture.show(restored, sourceA);
  assert.equal(restored.getSnapshot().state.x, 'LEGACY-A');
});

test('clean B preserves an unrecognizable v1 backup verbatim', async t => {
  const data = environment(t), session = 'legacy-unrecognized';
  const legacyKey = `dsh-iui.draft.v1:${session}:${block}`;
  const raw = '{synthetic unreadable draft';
  data.set(legacyKey, raw);
  const fixture = documentFixture(t, session), store = fixture.make();
  await fixture.show(store, sourceB);
  store.dispose();
  assert.equal(data.get(legacyKey), raw);
});

for (const kind of ['unreadable', 'foreign-source', 'unrecognized-fields', 'null-state', 'array-state', 'scalar-state', 'missing-dirty-field']) {
  test(`clean B preserves its ${kind} scoped backup verbatim`, async t => {
    const data = environment(t), fixture = documentFixture(t, 'scoped-' + kind), seed = fixture.make();
    await fixture.show(seed, sourceB);
    seed.set('x', 'ORIGINAL-B'); seed.dispose();
    const key = [...data.keys()].find(key => JSON.parse(data.get(key)).source === sourceB);
    assert.ok(key, 'seed a backup through the real store');
    const states = { 'null-state': null, 'array-state': [], 'scalar-state': 'unknown', 'missing-dirty-field': {} };
    const raw = kind === 'unreadable' ? '{unreadable original backup' : JSON.stringify({ source: kind === 'foreign-source' ? sourceA : sourceB, state: Object.hasOwn(states, kind) ? states[kind] : { x: 'ORIGINAL-B' }, dirty: kind === 'unrecognized-fields' ? 'unknown' : ['x'], revision: 0 });
    data.set(key, raw);
    const clean = fixture.make(); await fixture.show(clean, sourceB);
    assert.equal(clean.getSnapshot().state.x, 'B-default');
    clean.dispose();
    assert.equal(data.get(key), raw, 'cleanup cannot erase a backup the current source could not restore');
  });
}

test('quota failure retains both drafts and the old components version when A cannot reload', async t => {
  environment(t, { quota: true });
  const fixture = documentFixture(t), store = fixture.make();
  await fixture.show(store, sourceA);
  store.set('x', 'QUOTA-A');
  await fixture.show(store, sourceB);
  assert.equal(store.getSnapshot().previousDraft.componentsVersion, 2);
  store.set('x', 'QUOTA-B');
  fixture.offline.add(sourceA);
  await fixture.show(store, sourceA);
  assert.equal(store.getSnapshot().status, 'load-error');
  assert.equal(store.getSnapshot().state.x, 'QUOTA-A');
  assert.equal(store.getSnapshot().componentsVersion, 2);
  assert.equal(store.getSnapshot().previousDraft.source, sourceB);
  assert.equal(store.getSnapshot().previousDraft.state.x, 'QUOTA-B');
  assert.equal(store.getSnapshot().previousDraft.componentsVersion, componentsVersion);
});

test('a write that settles after the first cache deadline is eventually reclaimed', async t => {
  environment(t);
  const fixture = await cacheFixture(t, { delayedWrite: true });
  const lease = acquireDocument('late-cache-save', block), store = lease.store;
  await fixture.show(store);
  store.set('x', 'LATE-SAVE');
  lease.release();
  await flush();
  t.mock.timers.tick(30001);
  await flush();
  assert.equal(store.disposed, false, 'pending writes remain live');
  fixture.receipt.resolve();
  await flush();
  assert.equal(store.getSnapshot().status, 'saved');
  t.mock.timers.tick(30001);
  await flush();
  assert.equal(store.disposed, true, 'settling a delayed save must make zero-reference state reclaimable');
  const next = acquireDocument('late-cache-save', block);
  assert.notEqual(next.store, store);
  next.release();
});

test('reacquiring during a delayed write protects the active store until the new lease releases', async t => {
  environment(t);
  const fixture = await cacheFixture(t, { delayedWrite: true });
  const first = acquireDocument('reacquired-save', block), store = first.store;
  await fixture.show(store);
  store.set('x', 'ACTIVE-EDIT');
  first.release();
  t.mock.timers.tick(30001);
  const active = acquireDocument('reacquired-save', block);
  assert.equal(active.store, store);
  fixture.receipt.resolve();
  await flush();
  t.mock.timers.tick(90001);
  await flush();
  assert.equal(store.disposed, false);
  assert.equal(active.store.getSnapshot().state.x, 'ACTIVE-EDIT');
  active.release();
  t.mock.timers.tick(30001);
  await flush();
  assert.equal(store.disposed, true);
});

test('releasing a lease twice cannot retire another live lease', async t => {
  environment(t);
  const fixture = await cacheFixture(t);
  const first = acquireDocument('idempotent-release', block), active = acquireDocument('idempotent-release', block);
  await fixture.show(active.store);
  first.release();
  first.release();
  t.mock.timers.tick(30001);
  await flush();
  assert.equal(active.store.disposed, false, 'duplicate release does not consume a different view reference');
  active.store.set('x', 'STILL-ACTIVE');
  active.release();
  await flush();
  t.mock.timers.tick(30001);
  await flush();
  assert.equal(active.store.disposed, true);
});

test('a backed-up old draft survives cache eviction without preventing reclamation', async t => {
  environment(t);
  const fixture = await cacheFixture(t);
  const lease = acquireDocument('backed-cache-draft', block), store = lease.store;
  await fixture.show(store, sourceA);
  store.set('x', 'EVICTED-A');
  await fixture.show(store, sourceB);
  lease.release();
  t.mock.timers.tick(30001);
  await flush();
  assert.equal(store.disposed, true, 'a successfully backed-up old draft does not retain the whole cache entry');
  const restored = acquireDocument('backed-cache-draft', block);
  assert.notEqual(restored.store, store);
  await fixture.show(restored.store, sourceA);
  assert.equal(restored.store.getSnapshot().state.x, 'EVICTED-A');
  restored.release();
});

test('an unbacked old draft remains recoverable while its zero-reference cache entry is retained', async t => {
  environment(t, { quota: true });
  const fixture = await cacheFixture(t);
  const lease = acquireDocument('unbacked-cache-draft', block), store = lease.store;
  await fixture.show(store, sourceA);
  store.set('x', 'UNBACKED-A');
  await fixture.show(store, sourceB);
  lease.release();
  t.mock.timers.tick(90001);
  await flush();
  assert.equal(store.disposed, false, 'failed backup retains the only recoverable copy');
  const restored = acquireDocument('unbacked-cache-draft', block);
  assert.equal(restored.store, store);
  assert.equal(restored.store.getSnapshot().previousDraft.state.x, 'UNBACKED-A');
  await fixture.show(restored.store, sourceA);
  assert.equal(restored.store.getSnapshot().state.x, 'UNBACKED-A');
  restored.release();
});

test('recovering storage for B does not displace the unbacked A draft after switching through C', async t => {
  let quota = true;
  environment(t, { quota: () => quota });
  const fixture = documentFixture(t, 'three-source-recovery'), store = fixture.make();
  await fixture.show(store, sourceA);
  store.set('x', 'UNBACKED-A');
  await fixture.show(store, sourceB);
  quota = false;
  store.set('x', 'BACKED-B');
  await fixture.show(store, sourceC);
  assert.equal(store.getSnapshot().state.x, 'C-default');
  fixture.offline.add(sourceA);
  await fixture.show(store, sourceA);
  assert.equal(store.getSnapshot().status, 'load-error');
  assert.equal(store.getSnapshot().state.x, 'UNBACKED-A', 'a newer successful backup does not replace an older failed backup');
  assert.equal(store.getSnapshot().componentsVersion, sourceVersions.get(sourceA));
  await fixture.show(store, sourceB);
  assert.equal(store.getSnapshot().state.x, 'BACKED-B');
});

test('persistent quota failure keeps each of three source drafts and versions across repeated returns', async t => {
  environment(t, { quota: true });
  const fixture = documentFixture(t, 'three-source-quota'), store = fixture.make();
  const values = new Map([[sourceA, 'QUOTA-A'], [sourceB, 'QUOTA-B'], [sourceC, 'QUOTA-C']]);
  for (const [source, value] of values) {
    await fixture.show(store, source);
    store.set('x', value);
  }
  for (const source of values.keys()) fixture.offline.add(source);
  for (const source of [sourceA, sourceB, sourceC, sourceB, sourceA, sourceC]) {
    await fixture.show(store, source);
    assert.equal(store.getSnapshot().status, 'load-error');
    assert.equal(store.getSnapshot().state.x, values.get(source), 'each failed backup remains recoverable independently');
    assert.equal(store.getSnapshot().componentsVersion, sourceVersions.get(source), 'returning to an offline source retains its original component format');
  }
});

test('a zero-reference cache retains an unbacked A even when the latest old B draft was backed up', async t => {
  let quota = true;
  environment(t, { quota: () => quota });
  const fixture = await cacheFixture(t);
  const lease = acquireDocument('three-source-cache-recovery', block), store = lease.store;
  await fixture.show(store, sourceA);
  store.set('x', 'CACHE-UNBACKED-A');
  await fixture.show(store, sourceB);
  quota = false;
  store.set('x', 'CACHE-BACKED-B');
  await fixture.show(store, sourceC);
  lease.release();
  t.mock.timers.tick(90001);
  await flush();
  assert.equal(store.disposed, false, 'every unbacked source protects its only remaining copy');
  const restored = acquireDocument('three-source-cache-recovery', block);
  assert.equal(restored.store, store);
  await fixture.show(restored.store, sourceA);
  assert.equal(restored.store.getSnapshot().state.x, 'CACHE-UNBACKED-A');
  assert.equal(restored.store.getSnapshot().componentsVersion, sourceVersions.get(sourceA));
  await fixture.show(restored.store, sourceB);
  assert.equal(restored.store.getSnapshot().state.x, 'CACHE-BACKED-B');
  restored.release();
});

test('a zero-reference cache retains all earlier unbacked drafts during persistent quota failure', async t => {
  environment(t, { quota: true });
  const fixture = await cacheFixture(t);
  const lease = acquireDocument('three-source-cache-quota', block), store = lease.store;
  const values = new Map([[sourceA, 'CACHE-A'], [sourceB, 'CACHE-B'], [sourceC, 'CACHE-C']]);
  for (const [source, value] of values) {
    await fixture.show(store, source);
    store.set('x', value);
  }
  lease.release();
  await flush();
  t.mock.timers.tick(90001);
  await flush();
  assert.equal(store.disposed, false);
  const restored = acquireDocument('three-source-cache-quota', block);
  assert.equal(restored.store, store);
  for (const source of [sourceA, sourceB, sourceA, sourceB]) {
    await fixture.show(restored.store, source);
    assert.equal(restored.store.getSnapshot().state.x, values.get(source));
    assert.equal(restored.store.getSnapshot().componentsVersion, sourceVersions.get(source));
  }
  restored.release();
});
