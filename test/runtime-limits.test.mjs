import test from 'node:test';
import assert from 'node:assert/strict';
import { assertJSON, LIMITS, UIError } from '../src/runtime/limits.mjs';
import { validateState, LIMITS as STORAGE_LIMITS } from '../src/host/storage.mjs';
import { DocumentStore } from '../src/client/document-store.mjs';

// Measure the actual wire JSON independently of the browser implementation.
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
function stateAtBytes(target, character) {
  const state = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`k${index}`, '']));
  state.padding = '';
  const unit = bytes(character) - 2;
  const repeats = Math.floor((target - bytes(state)) / 8 / unit);
  for (let index = 0; index < 8; index++) state[`k${index}`] = character.repeat(repeats);
  state.padding = 'x'.repeat(target - bytes(state));
  assert.equal(bytes(state), target);
  assert.ok(Object.values(state).every(value => value.length <= LIMITS.string));
  return state;
}

for (const [name, character] of [
  ['ASCII', 'a'], ['Chinese', '汉'], ['emoji pair', '🌏'],
  ['lone high surrogate', '\ud800'], ['lone low surrogate', '\udfff'],
  ['escaped quote', '"'], ['escaped backslash', '\\'], ['escaped control', '\u0000'],
]) {
  test(`runtime and persistence use the same exact UTF-8 JSON boundary: ${name}`, () => {
    assert.equal(LIMITS.stateBytes, STORAGE_LIMITS.stateBytes);
    for (const offset of [-1, 0, 1]) {
      const state = stateAtBytes(STORAGE_LIMITS.stateBytes + offset, character);
      if (offset <= 0) {
        assert.equal(assertJSON(state), state);
        assert.deepEqual(validateState(state), state);
      } else {
        assert.throws(() => validateState(state), error => error.statusCode === 413);
        assert.throws(() => assertJSON(state), error => error instanceof UIError && error.code === 'DATA_LIMIT' && /128 KiB/.test(error.message));
      }
    }
  });
}

test('UTF-8 size includes object keys and nested JSON punctuation', () => {
  const state = { '汉🌏"\\\ud800': { list: ['汉🌏', '\udfff', '\u0000'], valid: true, amount: 2.5 } };
  const size = bytes(state);
  assert.equal(assertJSON(state, { ...LIMITS, stateBytes: size }), state);
  assert.throws(() => assertJSON(state, { ...LIMITS, stateBytes: size - 1 }), error => error.code === 'DATA_LIMIT');
});

test('client rejects oversized Chinese edits atomically before persistence and keeps valid state', async t => {
  const source = 'root = Form("说明",[{name:"x",label:"说明甲",type:"textarea"},{name:"y",label:"说明乙",type:"textarea"}])';
  const requests = [];
  const store = new DocumentStore('synthetic-utf8-limit', '1:1:0:0', {
    hash: async () => 'synthetic-hash',
    read: async (_session, _block, input) => {
      if (!input) return { revision: 0, sourceRevision: 'synthetic-hash', state: {} };
      requests.push(input);
      return { ...input, state: validateState(input.state), revision: 1 };
    },
  });
  t.after(() => store.dispose());
  store.update(source, false);
  for (let attempt = 0; attempt < 30 && store.snapshot.status === 'loading'; attempt++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.snapshot.status, 'saved');
  store.set('x', '汉'.repeat(24000));
  const previous = store.state, dirty = [...store.dirty];
  const oversized = { ...previous, y: '汉'.repeat(24000) };
  assert.equal(JSON.stringify(oversized).length, 48015);
  assert.equal(bytes(oversized), 144015);
  assert.throws(() => validateState(oversized), error => error.statusCode === 413);
  assert.throws(() => store.set('y', oversized.y), error => error.code === 'DATA_LIMIT' && /缩短文字/.test(error.message));
  assert.equal(store.state, previous);
  assert.deepEqual([...store.dirty], dirty);
  assert.equal(store.state.y, '');
  assert.equal(store.snapshot.source, source);
  assert.throws(() => store.action({ type: 'set', name: 'y', value: oversized.y }), error => error.code === 'DATA_LIMIT');
  assert.equal(store.state, previous);
  await store.save();
  assert.equal(requests.length, 1);
  assert.equal(bytes(requests[0].state), 72015);
  assert.equal(store.snapshot.status, 'saved');
});
