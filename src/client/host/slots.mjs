import { createElement } from 'react';

// Shared entry-preserving decoration protocol used by OpenCU and OMAA.
const decoration = Symbol.for('opencu.slot-decoration.v1');
const componentDecoration = Symbol.for('opencu.slot-component-decoration.v1');
const refreshEntry = Symbol.for('opencu.slot-refresh.v1');
const adapter = Symbol.for('dsh-intelligent-ui.presentation-adapter.v1');
const unwrapInactive = component => {
  while (component?.[componentDecoration]?.active === false) component = component[componentDecoration].previous;
  return component;
};

/** Preserve each native entry and its child-slot authority for the whole scope. */
export function decorateAssistantSlot(slots, decorate) {
  const name = 'conversation.chat.node', installed = new Map();
  let reconciling = false, dirty = false, stopped = false;
  function publish() {
    const entries = slots.entries(name), original = entries.find(entry => entry.options.key === 'assistant-step');
    if (!original) return;
    // Disposal deactivates the receiver before effects run. A live root can
    // publish this synchronous refresh without retaining a plugin contribution.
    const publisher = slots.ctx?.fiber?.uid === null ? slots.ctx.root.get('slots') : slots;
    if (!publisher || publisher.ctx?.fiber?.uid === null) return;
    const priority = Math.max(...entries.map(entry => entry.options.priority ?? 0)) + 1;
    if (!Number.isFinite(priority)) throw new Error('Cannot publish assistant decoration at a finite non-winning priority');
    const Probe = () => null;
    Probe[refreshEntry] = true;
    publisher.register({ name, key: original.options.key, priority }, Probe)();
  }
  function release(entry, state) {
    state.active = false;
    if (entry.component !== state.wrapper) return false;
    entry.component = unwrapInactive(state.previous);
    return true;
  }
  function reconcile() {
    if (stopped || slots.ctx?.fiber?.uid === null) return;
    if (reconciling) { dirty = true; return; }
    reconciling = true;
    try {
      do {
        dirty = false;
        const entries = slots.entries(name), live = new Set(entries);
        for (const [entry, state] of installed) if (!live.has(entry)) {
          installed.delete(entry); release(entry, state);
        }
        let changed = false;
        for (const entry of entries) {
          if (entry.options.key !== 'assistant-step' || entry.component?.[refreshEntry] || installed.has(entry)) continue;
          const previous = entry.component, component = decorate(previous);
          const state = { previous, active: true, wrapper: null };
          function Decorated(props) { return createElement(state.active ? component : previous, props); }
          state.wrapper = Decorated; Decorated[componentDecoration] = state;
          Decorated[adapter] = true;
          if (previous?.[decoration]) Decorated[decoration] = previous[decoration];
          entry.component = Decorated; installed.set(entry, state); changed = true;
        }
        if (changed) publish();
      } while (dirty && !stopped);
    } finally { reconciling = false; }
  }
  const unsubscribe = slots.subscribe(name, reconcile); reconcile();
  return () => {
    if (stopped) return;
    stopped = true; unsubscribe();
    let changed = false;
    for (const [entry, state] of [...installed].reverse()) changed = release(entry, state) || changed;
    installed.clear();
    if (changed) publish();
  };
}
