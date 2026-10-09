import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { hostFixture, until } from '../fixtures/host.mjs';

const text = 'OWNER_NATIVE_PROSE\n\n```openui\nroot = Stack([Text("OWNER_UI"),NumberInput("OWNER 参数","ownerValue",3,0,10)])\n```\n\nOWNER_NATIVE_TRAILING';
const reasoning = 'OWNER_REASONING_SUMMARY\n\nOWNER_REASONING_DETAIL must remain native Markdown.';
const reply = async function* (payload) {
  if (!payload.tools?.length) { yield { delta: { content: 'owner probe' }, finish_reason: 'stop' }; return; }
  yield { delta: { role: 'assistant', reasoning_content: reasoning } };
  yield { delta: { content: text }, finish_reason: 'stop' };
};

for (const plugin of [false, true]) {
  test(`native packaged reasoning owner: ${plugin ? 'IUI' : 'stock'} disclosure and response`, { timeout: 300000 }, async t => {
    const evidence = resolve(process.env.IUI_OWNER_EVIDENCE ?? 'work/a2-compat/owner', plugin ? 'iui' : 'stock');
    await mkdir(evidence, { recursive: true, mode: 0o700 });
    const f = await hostFixture(t, { plugin, reply });
    t.after(async () => {
      if (!t.passed && !f.page.isClosed()) {
        await f.page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true });
        await writeFile(join(evidence, 'failure-dom.html'), await f.page.content(), { mode: 0o600 });
      }
    });
    const consoleErrors = [];
    f.page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const { sessionId } = await f.rpc('session/create', { request: { workspaceId: f.workspace.workspace.workspaceId, agentPreset: 'standard' } });
    await f.rpc('session/selectModel', { request: { sessionId, provider: 'fixture', model: 'fixture' } });
    await f.rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'OWNER_REAL_HOST_PROBE' }], clientTimeZone: 'UTC' } });
    await until(async () => (await f.rpc('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId && !item.running && !item.blank));
    await f.page.locator(`[data-row-key="session:${sessionId}"]`).click();
    const processRow = f.page.locator('button[data-turn-process]').first();
    await processRow.waitFor({ state: 'visible' });
    if (await processRow.getAttribute('aria-expanded') === 'false') await processRow.click();
    const stepHeader = f.page.locator('[data-step-process] button[aria-controls]:visible').first();
    if (await stepHeader.count() && await stepHeader.getAttribute('aria-expanded') === 'false') await stepHeader.click();
    const row = f.page.locator('[data-variant="think"]:visible').first();
    await row.waitFor({ state: 'visible' });
    assert.equal(await row.getAttribute('data-expanded'), null);
    assert.ok((await f.page.locator('body').innerText()).includes('OWNER_NATIVE_TRAILING'));
    if (plugin) {
      await f.page.getByLabel('OWNER 参数', { exact: true }).waitFor();
      await until(() => f.page.getByLabel('OWNER 参数', { exact: true }).isEnabled());
      await f.page.getByLabel('OWNER 参数', { exact: true }).fill('7');
    } else assert.equal(await f.page.locator('[data-iui-block]').count(), 0);
    const beforeRequests = f.requests.length;
    await f.page.screenshot({ path: join(evidence, 'collapsed.png'), fullPage: true });
    await row.getByRole('button').first().click();
    const expectedFailure = plugin && process.env.IUI_EXPECT_OWNER_FAILURE === '1';
    if (expectedFailure) {
      await until(() => [...consoleErrors, ...f.errors].some(message => /renderSlot.*not a function/.test(message)));
      await until(async () => await f.page.locator('[data-iui-block]').count() === 0);
      assert.ok((await f.page.locator('body').innerText()).includes('OWNER_NATIVE_TRAILING'), 'native renderer survives shadow abdication');
    } else {
      await until(async () => await row.getAttribute('data-expanded') === 'true');
      assert.ok((await row.innerText()).includes('OWNER_REASONING_DETAIL'));
      if (plugin) assert.equal(await f.page.getByLabel('OWNER 参数', { exact: true }).inputValue(), '7', 'native disclosure preserves local UI input');
      await row.getByRole('button').first().click();
      await until(async () => await row.getAttribute('data-expanded') === null);
      await row.getByRole('button').first().click();
      await until(async () => await row.getAttribute('data-expanded') === 'true');
      assert.deepEqual(f.errors, []);
      assert.deepEqual(consoleErrors.filter(message => !/^Failed to load resource/.test(message)), []);
    }
    assert.equal(f.requests.length, beforeRequests, 'reasoning and local UI actions do not start another model request');
    await f.page.screenshot({ path: join(evidence, expectedFailure ? 'expanded-failure.png' : 'expanded.png'), fullPage: true });
    await writeFile(join(evidence, 'snapshot.json'), JSON.stringify(await f.snapshot(sessionId), null, 2), { mode: 0o600 });
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ mode: expectedFailure ? 'expected-defect-reproduced' : 'native-owner-check', plugin, hostVersion: process.env.IUI_TEST_HOST_VERSION ?? 'actual-test-cli', health: plugin ? (await f.api('/health')).body : null, packageSha256: f.tar ? createHash('sha256').update(await readFile(f.tar)).digest('hex') : null, errors: f.errors, consoleErrors, remainingUiBlocks: await f.page.locator('[data-iui-block]').count(), localModelRequests: f.requests.length, externalModelRequests: 0 }, null, 2), { mode: 0o600 });
  });
}
