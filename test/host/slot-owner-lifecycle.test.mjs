import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
import { createElement } from 'react';
import { decorateAssistantSlot } from '../../src/client/host/slots.mjs';

const requireSdk = createRequire(join(resolve(process.env.IUI_TEST_SDK_ROOT ?? '.'), 'package.json'));
const { Context } = requireSdk('@deepseek-ai/cordis');
const rendererSource = await readFile(join(dirname(requireSdk.resolve('@deepseek-ai/dsh-client-ui-renderer')), 'client.js'), 'utf8');
let renderer;
vm.runInNewContext(rendererSource, { window: { __ModuleLoader__: { load: ({ factory }) => { renderer = factory(requireSdk); } } } });
const settle = () => new Promise(resolve => setImmediate(resolve));
const name = 'conversation.chat.node', body = 'conversation.chat.reasoning.body';

async function fixture(t) {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  new renderer.SlotRegistry(ctx);
  ctx.slots.register({ name: 'root', children: { [name]: { kind: 'keyed', scope: 'session' } } }, () => null);
  const options = { name, key: 'assistant-step', priority: 0, label: 'native metadata',
    children: { [body]: { kind: 'single', scope: 'session' } }, inject: () => ({ keep: 'native' }), locale: 'chat', store: { getSnapshot: () => ({}), subscribe: () => () => {}, actions: {} } };
  const Native = props => createElement('p', { ...props, native: true });
  const mountNative = () => ctx.plugin({ name: 'native-owner', apply(local) { local.slots.register(options, Native); } });
  let owner = await mountNative();
  const entry = ctx.slots.entries(name)[0];
  const mountDecorator = label => ctx.plugin({ name: label, apply(local) {
    local.effect(() => decorateAssistantSlot(local.slots, Original => props => createElement(Original, props)));
  } });
  return { ctx, options, Native, entry, owner, mountNative, mountDecorator };
}

for (const unloadOrder of [[0, 1], [1, 0]]) {
  test(`actual SDK: native child owner and metadata survive decoration, load and unload order ${unloadOrder.join('-')}`, async t => {
    const f = await fixture(t), { ctx, entry, Native } = f;
    const metadata = { options: entry.options, children: entry.children, inject: entry.inject, locale: entry.locale, store: entry.store, registrant: entry.registrant };
    const initialVersion = ctx.slots.getVersion(name), bodyVersion = ctx.slots.getVersion(body);
    const fibers = [await f.mountDecorator('iui-first'), await f.mountDecorator('compatible-second')];
    await settle();
    assert.deepEqual(ctx.slots.entries(name), [entry], 'no shadow entry or refresh registration survives');
    assert.equal(ctx.slots.entriesOfSlot(name)[0], entry, 'the original declaration owner remains the winner');
    for (const [key, value] of Object.entries(metadata)) assert.equal(entry[key], value, key + ' identity');
    assert.equal(ctx.slots.spec(body), f.options.children[body], 'original child declaration remains authoritative');
    assert.equal(ctx.slots.getVersion(body), bodyVersion, 'component decoration never redeclares the child slot');
    assert.ok(ctx.slots.getVersion(name) > initialVersion, 'public slot version publishes component updates');
    await fibers[unloadOrder[0]].dispose(); await settle();
    assert.notEqual(entry.component, Native, 'the other decoration stays installed');
    await fibers[unloadOrder[1]].dispose(); await settle();
    assert.equal(entry.component, Native, 'both unload orders restore exact native component identity');
    assert.deepEqual(ctx.slots.entries(name), [entry]);
    assert.equal(ctx.slots.spec(body), f.options.children[body]);
  });
}

test('actual SDK: native owner unload cascades child slots and a new generation receives one decoration', async t => {
  const f = await fixture(t), decorator = await f.mountDecorator('iui-reload');
  await settle();
  const bodyDisposer = f.ctx.slots.register({ name: body }, () => null);
  assert.equal(f.ctx.slots.entries(body).length, 1);
  await f.owner.dispose(); await settle();
  assert.equal(f.ctx.slots.spec(body), undefined);
  assert.equal(f.ctx.slots.entries(name).length, 0);
  assert.equal(f.ctx.slots.entries(body).length, 0);
  bodyDisposer();
  const nextOwner = await f.mountNative(); await settle();
  const nextEntry = f.ctx.slots.entries(name)[0];
  assert.notEqual(nextEntry, f.entry, 'a remounted owner uses a new authorization identity');
  assert.notEqual(nextEntry.component, f.Native);
  assert.equal(f.ctx.slots.entries(name).length, 1);
  await decorator.dispose(); await settle();
  assert.equal(nextEntry.component, f.Native);
  await nextOwner.dispose(); await settle();
  assert.equal(f.ctx.slots.spec(body), undefined);
});

test('actual SDK: decoration installed before a native registration remains scoped and restores later foreign component changes', async t => {
  const f = await fixture(t);
  await f.owner.dispose(); await settle();
  const decorator = await f.mountDecorator('iui-late-native');
  const nextOwner = await f.mountNative(); await settle();
  const entry = f.ctx.slots.entries(name)[0];
  assert.notEqual(entry.component, f.Native);
  const Foreign = () => createElement('p', { foreign: true });
  entry.component = Foreign;
  await decorator.dispose(); await settle();
  assert.equal(entry.component, Foreign, 'unload does not erase a later unrelated component replacement');
  await nextOwner.dispose(); await settle();
  assert.equal(f.ctx.slots.entries(name).length, 0);
});
