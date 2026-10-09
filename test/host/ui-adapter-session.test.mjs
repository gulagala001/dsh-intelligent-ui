import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBridge, creationOptions } from '../../src/client/host/session.mjs';
import { decorateAssistantSlot } from '../../src/client/host/slots.mjs';

const gate = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const observable = value => { const listeners = new Set(); return { getSnapshot: () => value,
  subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  set: next => { value = next; for (const listener of listeners) listener(); }, listeners }; };

function fixture(options = {}) {
  const current = observable({ key: 'origin' }), panelInfo = observable({ activePanelId: null });
  const calls = [], bindings = new Map();
  const byId = { origin: { id: 'origin', cwd: '/original', blank: false } };
  const list = observable({ byId, ids: ['origin'], phase: 'ready' });
  const binding = (id, model) => {
    const projected = { modelSelection: observable(model), agentPreset: observable(byId[id].projectionValues?.agentPreset) };
    const session = { getSnapshot: () => ({ removed: false }),
      projections: { faceOf: key => projected[key] ??= observable(undefined) },
      beginSubmission: input => { calls.push(['echo', id, input]); return { requestId: 'request', abandon: () => calls.push(['abandon', id]) }; },
      prompt: async (...args) => { calls.push(['prompt', id, ...args]); return await options.prompt?.promise ?? { ok: true, value: { accepted: true } }; } };
    const value = { sessionId: id, session }; bindings.set(id, value); return value;
  };
  binding('origin', options.model);
  const ctx = {
    uiSession: { adapter: { current } }, layout: { panelInfo },
    workspaces: { list: observable({ items: options.noWorkspace ? [] : [{ workspaceId: 'w1', sessionIds: ['origin'] }] }),
      archiveSession: async id => { calls.push(['archive', id]); },
      create: async input => { calls.push(['workspaceCreate', input]); const workspace = { workspaceId: 'w-created', path: input.path, sessionIds: [] };
        ctx.workspaces.list.set({ phase: 'ready', items: [workspace] }); return workspace; },
      initializeDefault: async signal => { calls.push(['workspaceDefault']); signal.throwIfAborted(); if (options.refuseDefault) return undefined;
        const workspace = { workspaceId: 'w-default', path: '/default', sessionIds: [] }; ctx.workspaces.list.set({ phase: 'ready', items: [workspace] }); return workspace; } },
    sessions: { list, binding: id => bindings.get(id),
      create: async opts => { calls.push(['create', opts]); if (options.create) await options.create.promise;
        byId.new = { id: 'new', blank: true, projectionValues: { agentPreset: 'standard' } }; binding('new'); return 'new'; },
      retain: (id, opts) => { calls.push(['retain', id, opts.source]); return { sessionId: id, binding: bindings.get(id),
        ready: options.ready?.promise ?? Promise.resolve(bindings.get(id)), release: () => calls.push(['release', id]) }; },
      using: async (id, opts, operation) => { const ref = ctx.sessions.retain(id, opts); try { return await operation(ref); } finally { ref.release(); } },
      refreshProjections: async id => { calls.push(['projections', id]); }, },
    remote: { agentPresets: { select: async (id, preset) => { calls.push(['preset', id, preset]);
      if (options.preset) await options.preset.promise;
      if (options.refusePreset) return { ok: false, error: { message: 'missing preset' } };
      if (!options.delayedProjection) {
        byId[id].projectionValues.agentPreset = preset;
        bindings.get(id).session.projections.faceOf('agentPreset').set(preset);
      }
      return { ok: true, value: preset }; } },
      session: { selectModel: async request => { calls.push(['model', request]); return { ok: true, value: request }; } } },
    uiWorkspace: { startSession: () => { throw new Error('void native startSession must not be used'); },
      openSession: id => { calls.push(['open', id]); if (options.openThrows) throw new Error('open refused');
        if (!options.delayedOpen) current.set({ key: id }); } },
  };
  return { ctx, current, panelInfo, calls, bindings, byId };
}

test('native smart entry creates an exact Session, inherits full model and applies preset before opening', async () => {
  const f = fixture({ model: { next: { provider: 'p', model: 'm', reasoningEffort: 'high' } } });
  const bridge = createSessionBridge(f.ctx);
  assert.equal(await bridge.create(), 'new');
  assert.deepEqual(f.calls.map(row => row[0]), ['create', 'retain', 'preset', 'model', 'projections', 'open', 'release']);
  assert.deepEqual(f.calls[0][1], { workspaceId: 'w1' });
  assert.deepEqual(f.calls[3][1], { sessionId: 'new', provider: 'p', model: 'm', reasoningEffort: 'high' });
  assert.equal(f.byId.new.projectionValues.agentPreset, 'intelligent-chat');
  bridge.dispose();
});

test('rapid small-plus clicks share one creation and wait for exact open confirmation', async () => {
  const pending = gate(), f = fixture({ preset: pending, delayedOpen: true });
  const bridge = createSessionBridge(f.ctx, { timeoutMs: 200 });
  const first = bridge.create(), second = bridge.create();
  assert.equal(first, second);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(row => row[0] === 'create').length, 1);
  assert.equal(f.calls.some(row => row[0] === 'open'), false);
  pending.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bridge.getSnapshot().busy, true);
  f.current.set({ key: 'new' });
  assert.equal(await first, 'new');
  assert.equal(bridge.getSnapshot().busy, false);
  bridge.dispose();
});

test('waits for native preset projection even when refreshProjections already has its initial baseline', async () => {
  const f = fixture({ delayedProjection: true }), bridge = createSessionBridge(f.ctx, { timeoutMs: 200 });
  const attempt = bridge.create();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.some(row => row[0] === 'open'), false);
  f.bindings.get('new').session.projections.faceOf('agentPreset').set('intelligent-chat');
  assert.equal(await attempt, 'new'); bridge.dispose();
});

test('ungrouped current cwd registers a native Workspace before creating its editable Session', async () => {
  const f = fixture({ noWorkspace: true });
  assert.deepEqual(creationOptions(f.ctx, 'origin'), { cwd: '/original' });
  assert.deepEqual(creationOptions(f.ctx, undefined), {});
  const bridge = createSessionBridge(f.ctx);
  assert.equal(await bridge.create(), 'new');
  assert.deepEqual(f.calls.slice(0, 2), [['workspaceCreate', { path: '/original' }], ['create', { workspaceId: 'w-created' }]]);
  bridge.dispose();
});

test('no-origin entry prepares native default Workspace and fails cleanly when Host cannot initialize one', async () => {
  for (const refuseDefault of [false, true]) {
    const f = fixture({ noWorkspace: true, refuseDefault }); f.current.set({ key: undefined });
    const bridge = createSessionBridge(f.ctx);
    if (refuseDefault) {
      await assert.rejects(bridge.create(), /选择工作区/);
      assert.deepEqual(f.calls, [['workspaceDefault']]);
    } else {
      assert.equal(await bridge.create(), 'new');
      assert.deepEqual(f.calls.slice(0, 2), [['workspaceDefault'], ['create', { workspaceId: 'w-default' }]]);
    }
    bridge.dispose();
  }
});

test('no-origin entry uses an existing recent Workspace instead of creating a read-only ungrouped Session', async () => {
  const f = fixture(); f.current.set({ key: undefined });
  const bridge = createSessionBridge(f.ctx); assert.equal(await bridge.create(), 'new');
  assert.deepEqual(f.calls[0], ['create', { workspaceId: 'w1' }]); bridge.dispose();
});

test('entry waits for the native Workspace catalog and cancels that waiter on navigation', async () => {
  for (const cancel of [false, true]) {
    const f = fixture(); f.ctx.workspaces.list.set({ phase: 'pending', items: [] });
    const bridge = createSessionBridge(f.ctx, { timeoutMs: 100 });
    const attempt = bridge.create(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.length, 0);
    if (cancel) {
      f.current.set({ key: 'elsewhere' }); await assert.rejects(attempt, /页面已切换/);
    } else {
      f.ctx.workspaces.list.set({ phase: 'ready', items: [{ workspaceId: 'ready-workspace', sessionIds: ['origin'] }] });
      assert.equal(await attempt, 'new'); assert.deepEqual(f.calls[0], ['create', { workspaceId: 'ready-workspace' }]);
    }
    assert.equal(f.ctx.workspaces.list.listeners.size, 0); bridge.dispose();
  }
});

test('preset refusal never opens or prompts; recovers only the attempt-owned blank Session', async () => {
  const f = fixture({ refusePreset: true }), bridge = createSessionBridge(f.ctx);
  await assert.rejects(bridge.create(), /missing preset/);
  assert.equal(f.current.getSnapshot().key, 'origin');
  assert.deepEqual(f.calls.filter(row => ['open', 'prompt', 'archive'].includes(row[0])), [['archive', 'new']]);
  assert.equal(bridge.getSnapshot().busy, false); bridge.dispose();
});

test('switching conversation while preset is pending cannot steal navigation or send to new current', async () => {
  const pending = gate(), f = fixture({ preset: pending }), bridge = createSessionBridge(f.ctx);
  const attempt = bridge.create();
  await new Promise(resolve => setImmediate(resolve));
  f.current.set({ key: 'elsewhere' }); pending.resolve();
  await assert.rejects(attempt, /页面已切换/);
  assert.equal(f.calls.some(row => ['open', 'prompt'].includes(row[0])), false);
  bridge.dispose();
});

test('switching main panel cancels pending creation and unloading clears subscriptions', async () => {
  const pending = gate(), f = fixture({ ready: pending }), bridge = createSessionBridge(f.ctx);
  const attempt = bridge.create();
  await new Promise(resolve => setImmediate(resolve));
  f.panelInfo.set({ activePanelId: 'plugins' }); pending.resolve();
  await assert.rejects(attempt, /页面已切换/);
  assert.equal(f.current.listeners.size, 0); assert.equal(f.panelInfo.listeners.size, 0);
  bridge.dispose();
});

test('navigation failures never infer a current Session or perform first submission', async () => {
  for (const option of [{ openThrows: true }, { delayedOpen: true }]) {
    const f = fixture(option), bridge = createSessionBridge(f.ctx, { timeoutMs: 10 });
    await assert.rejects(bridge.create(), /open refused|超时/);
    assert.equal(f.current.getSnapshot().key, 'origin');
    assert.equal(f.calls.some(row => row[0] === 'prompt'), false);
    assert.equal(f.current.listeners.size, 0); bridge.dispose();
  }
});

test('inline and artifact submissions share exact-session native echo, queue mode and duplicate guard', async () => {
  const pending = gate(), f = fixture({ prompt: pending }), bridge = createSessionBridge(f.ctx);
  const first = bridge.submit('origin', '1:0:2:0', 'continue');
  const second = bridge.submit('origin', '1:0:2:1', 'continue');
  assert.equal(first, second);
  await new Promise(resolve => setImmediate(resolve));
  const sent = f.calls.filter(row => row[0] === 'prompt');
  assert.equal(sent.length, 1); assert.equal(sent[0][1], 'origin'); assert.equal(sent[0][3], 'queue');
  assert.equal(sent[0][5], 'request');
  pending.resolve({ ok: true, value: { accepted: true } }); await first;
  assert.equal(f.current.listeners.size, 0); bridge.dispose();
});

test('stale actions and invalid block identities reject before prompt', async () => {
  const f = fixture(), bridge = createSessionBridge(f.ctx);
  await assert.rejects(bridge.submit('elsewhere', '1:0:0:0', 'send'), /所属的会话|所在的会话/);
  await assert.rejects(bridge.submit('origin', '../session', 'send'), /身份/);
  assert.equal(f.calls.length, 0); bridge.dispose();
});

test('native prompt refusal abandons its echo and allows a later retry', async () => {
  const pending = gate(), f = fixture({ prompt: pending }), bridge = createSessionBridge(f.ctx);
  const first = bridge.submit('origin', '1:0:0:0', 'send');
  pending.resolve({ ok: false, error: { message: 'prompt refused' } });
  await assert.rejects(first, /prompt refused/);
  assert.deepEqual(f.calls.filter(row => row[0] === 'abandon'), [['abandon', 'origin']]);
  await assert.rejects(bridge.submit('origin', '1:0:0:0', 'retry'), /prompt refused/);
  assert.equal(f.calls.filter(row => row[0] === 'prompt').length, 2); bridge.dispose();
});

test('renderer shadow preserves all original injection/store/locale data and restores across live replacement', () => {
  const entries = [], listeners = new Set(), slots = {
    entries: () => [...entries].sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0)),
    subscribe: (_, listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    register(options, component) { const entry = { options, component, inject: options.inject, locale: options.locale, store: options.store }; entries.push(entry);
      for (const listener of listeners) listener();
      return () => { entries.splice(entries.indexOf(entry), 1); for (const listener of listeners) listener(); }; },
  };
  const original = { component: function Native() {}, options: { key: 'assistant-step', priority: 0 },
    inject: () => ({ hooks: { presentation: 'native-policy' } }), locale: 'chat', store: { native: true } };
  entries.push(original);
  const stop = decorateAssistantSlot(slots, () => function Adapter() {});
  assert.equal(entries.length, 2); const wrapper = slots.entries()[0];
  assert.equal(wrapper.inject, original.inject); assert.equal(wrapper.locale, original.locale); assert.equal(wrapper.store, original.store);
  entries.splice(entries.indexOf(original), 1); for (const listener of listeners) listener();
  assert.equal(entries.length, 0);
  const replacement = { ...original, component: function NewNative() {} }; entries.push(replacement);
  for (const listener of listeners) listener(); assert.equal(entries.length, 2);
  stop(); assert.deepEqual(entries, [replacement]); assert.equal(listeners.size, 0);
});
