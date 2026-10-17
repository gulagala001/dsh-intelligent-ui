import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hostFixture, until } from '../fixtures/host.mjs';

test('current package uses the official tool loop, native UI submission and persisted state', { timeout: 180000 }, async t => {
  const source = 'root = Stack([Counter("人数","people",2,1,10),Button("确认人数",{type:"submit",text:"IUI_COMPAT_SUBMIT",fields:["people"]})])';
  const f = await hostFixture(t, { reply: payload => {
    if (!payload.tools?.length) return [{ delta: { content: 'IUI compatibility' }, finish_reason: 'stop' }];
    if (JSON.stringify(payload.messages).includes('IUI_COMPAT_SUBMIT')) return [{ delta: { content: '原生提交已收到。' }, finish_reason: 'stop' }];
    if (!payload.messages.some(message => message.role === 'tool' && message.tool_call_id === 'iui-compat-read')) return [{ delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'iui-compat-read', type: 'function', function: { name: 'read', arguments: JSON.stringify({ file_path: join(f.cwd, 'probe.txt') }) } }] }, finish_reason: 'tool_calls' }];
    return [{ delta: { content: `保留普通正文。\n\n\`\`\`openui\n${source}\n\`\`\`\n\n保留尾部正文。` }, finish_reason: 'stop' }];
  } });
  await writeFile(join(f.cwd, 'probe.txt'), 'IUI_NATIVE_TOOL_RESULT\n');
  const { sessionId } = await f.rpc('session/create', { request: { workspaceId: f.workspace.workspace.workspaceId, agentPreset: 'intelligent-chat' } });
  await f.rpc('session/selectModel', { request: { sessionId, provider: 'fixture', model: 'fixture' } });
  await f.rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'IUI_COMPAT_TOOL_LOOP' }], clientTimeZone: 'UTC' } });
  await until(async () => (await f.rpc('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId && !item.running && !item.blank));
  assert.ok(f.requests.some(payload => JSON.stringify(payload.messages).includes('IUI_NATIVE_TOOL_RESULT')));
  await f.page.locator(`[data-row-key="session:${sessionId}"]`).click();
  const surface = f.page.locator('[data-iui-block]').first();
  await surface.getByRole('button', { name: '增加人数', exact: true }).waitFor();
  await until(() => surface.getByRole('button', { name: '增加人数', exact: true }).isEnabled());
  await surface.getByRole('button', { name: '增加人数', exact: true }).click();
  const block = await surface.getAttribute('data-iui-block');
  const state = await until(async () => { const result = await f.api(`/state?session=${sessionId}&block=${block}`); return result.body.state?.people === 3 && result.body; });
  await f.page.reload();
  await surface.getByRole('button', { name: '确认人数', exact: true }).waitFor();
  await until(() => surface.getByRole('button', { name: '确认人数', exact: true }).isEnabled());
  assert.match(await surface.innerText(), /3/);
  await surface.getByRole('button', { name: '展开交互内容', exact: true }).click();
  await f.page.locator('.iui-artifact-pane .iui-surface').waitFor();
  await f.page.locator('.iui-artifact-pane').getByRole('button', { name: '确认人数', exact: true }).click();
  await until(() => f.requests.some(payload => JSON.stringify(payload.messages).includes('IUI_COMPAT_SUBMIT')));
  await f.page.getByText('原生提交已收到。', { exact: true }).waitFor();
  assert.deepEqual(f.errors, []);
  const health = (await f.api('/health')).body;
  assert.equal(health.version, process.env.IUI_EXPECT_VERSION);
  assert.equal(health.sdkVersion, process.env.IUI_EXPECT_HOST);
  if (process.env.IUI_COMPAT_EVIDENCE) {
    await mkdir(process.env.IUI_COMPAT_EVIDENCE, { recursive: true });
    await writeFile(join(process.env.IUI_COMPAT_EVIDENCE, 'result.json'), JSON.stringify({ health, sessionId, block, revision: state.revision, state: state.state, nativeRead: true, nativeSubmit: true, expandedPane: true, browserReload: true, modelIsSynthetic: true, errors: f.errors }, null, 2));
  }
});
