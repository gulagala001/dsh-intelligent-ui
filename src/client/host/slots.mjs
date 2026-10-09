const ADAPTER = Symbol.for('dsh-intelligent-ui.presentation-adapter.v1');

/** Shadow the current live keyed renderer; release restores the original ledger entry. */
export function decorateAssistantSlot(slots, decorate) {
  const name = 'conversation.chat.node';
  let installed, stopped = false, reconciling = false, dirty = false;
  const reconcile = () => {
    if (stopped || slots.ctx?.fiber?.uid === null) return;
    if (reconciling) { dirty = true; return; }
    reconciling = true;
    try {
      do {
        dirty = false;
        const entries = slots.entries(name);
        const original = entries.find(entry => entry.options.key === 'assistant-step' && !entry.component?.[ADAPTER]);
        if (installed?.original !== original) {
          const previous = installed; installed = undefined; previous?.dispose();
        }
        if (original && !installed) {
          const component = decorate(original.component);
          component[ADAPTER] = true;
          const options = { name, ...original.options, priority: (original.options.priority ?? 0) - 1,
            ...(original.inject ? { inject: original.inject } : {}),
            ...(original.locale ? { locale: original.locale } : {}),
            ...(original.store ? { store: original.store } : {}) };
          const dispose = slots.register(options, component);
          installed = { original, dispose };
        }
      } while (dirty && !stopped);
    } finally { reconciling = false; }
  };
  const off = slots.subscribe(name, reconcile);
  reconcile();
  return () => { stopped = true; off(); installed?.dispose(); installed = undefined; };
}
