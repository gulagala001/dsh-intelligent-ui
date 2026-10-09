export const LIMITS = Object.freeze({ source: 128000, tokens: 24000, statements: 512, depth: 48, ops: 40000, nodes: 2000, array: 2000, string: 32000, stateBytes: 131072, stateKeys: 256 });
export class UIError extends Error { constructor(code, message) { super(message); this.name = 'UIError'; this.code = code; } }
export const badKey = key => ['__proto__', 'prototype', 'constructor', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'].includes(String(key));
export function validName(key) { return typeof key === 'string' && /^\$?[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) && !badKey(key.replace(/^\$/, '')); }
export function assertJSON(value, limits = LIMITS) {
  let count = 0, bytes = 0; const active = new Set();
  const walk = (v, depth) => {
    if (++count > limits.ops || depth > limits.depth) throw new UIError('DATA_LIMIT', '数据过深或过多');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new UIError('NON_FINITE', '计算产生了无效数字'); return; }
    if (typeof v === 'string') { bytes += v.length * 3; if (v.length > limits.string) throw new UIError('STRING_LIMIT', '文字过长'); return; }
    if (typeof v !== 'object' || active.has(v)) throw new UIError('INVALID_DATA', '仅支持无循环的 JSON 数据');
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== null && proto !== Object.prototype) throw new UIError('INVALID_DATA', '不支持此对象');
    active.add(v);
    const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x]) : Object.entries(v);
    if (entries.length > (Array.isArray(v) ? limits.array : limits.stateKeys)) throw new UIError('DATA_LIMIT', '数据项目过多');
    for (const [key, child] of entries) { if (badKey(key)) throw new UIError('UNSAFE_KEY', '不支持此字段'); bytes += key.length * 3; walk(child, depth + 1); }
    active.delete(v);
  };
  walk(value, 0); if (bytes > limits.stateBytes * 3 || JSON.stringify(value).length > limits.stateBytes) throw new UIError('DATA_LIMIT', '数据超过大小限制');
  return value;
}
export function budget(limits = LIMITS) { return { ops: 0, nodes: 0, active: new Set(), limits, step(depth = 0, amount = 1) { this.ops += amount; if (this.ops > limits.ops || depth > limits.depth) throw new UIError('BUDGET', '这段交互超过了计算限制'); } }; }
