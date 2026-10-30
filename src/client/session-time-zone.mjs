// Current Chromium can report a fixed UTC system zone as "+00:00".
// DSH's prompt boundary accepts UTC or Area/Location identifiers only.
export function normalizePromptTimeZone(request) {
  if (request?.clientTimeZone !== '+00:00' && request?.clientTimeZone !== '-00:00') return request;
  return { ...request, clientTimeZone: 'UTC' };
}

export function applySessionTimeZone(ctx) {
  ctx.effect(() => {
    let active = true;
    const restore = ['session', 'subagents'].map(name => {
      const service = ctx.remote[name];
      const descriptor = Object.getOwnPropertyDescriptor(service, 'prompt');
      if (!descriptor?.configurable) throw new Error(`Cannot adapt remote.${name}.prompt time zone`);
      // Preserve Gateway's getter: it captures the calling Agent context on
      // every read, so caching one bound prompt would mix scoped ownership.
      function get() {
        const prompt = descriptor.get ? descriptor.get.call(this) : descriptor.value;
        return function (request, ...args) {
          return prompt.call(this, active ? normalizePromptTimeZone(request) : request, ...args);
        };
      }
      Object.defineProperty(service, 'prompt', { configurable: true, enumerable: descriptor.enumerable, get });
      return () => {
        if (Object.getOwnPropertyDescriptor(service, 'prompt')?.get === get) Object.defineProperty(service, 'prompt', descriptor);
      };
    });
    return () => { active = false; restore.reverse().forEach(dispose => dispose()); };
  });
}
