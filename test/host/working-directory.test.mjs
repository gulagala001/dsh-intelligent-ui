import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hostFixture, until } from '../fixtures/host.mjs';

const requireSdk = createRequire(join(resolve(process.env.IUI_TEST_SDK_ROOT ?? '.'), 'package.json'));
const hostVersion = requireSdk('@deepseek-ai/dsh/package.json').version;

if (['0.2.1-alpha.2', '0.2.1-alpha.3'].includes(hostVersion)) test(`${hostVersion} native working_directory updates required context while preserving IUI session origin and state`, { timeout: 180000 }, async t => {
  const evidence = resolve(process.env.IUI_DIRECTORY_EVIDENCE ?? 'work/a2-compat/working-directory');
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const f = await hostFixture(t, { reply: payload => {
    if (!payload.tools?.length) return [{ delta: { content: 'working directory probe' }, finish_reason: 'stop' }];
    if (!payload.messages.some(message => message.role === 'tool' && message.tool_call_id === 'iui-working-directory')) return [{ delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'iui-working-directory', type: 'function', function: { name: 'working_directory', arguments: JSON.stringify({ cd: './nested' }) } }] }, finish_reason: 'tool_calls' }];
    return [{ delta: { content: 'Directory updated.\n```openui\nroot = NumberInput("目录切换后参数","directoryValue",3,0,10)\n```' }, finish_reason: 'stop' }];
  } });
  const nextCwd = join(f.cwd, 'nested'); await mkdir(nextCwd);
  const { sessionId } = await f.rpc('session/create', { request: { workspaceId: f.workspace.workspace.workspaceId, agentPreset: 'intelligent-chat' } });
  await f.rpc('session/selectModel', { request: { sessionId, provider: 'fixture', model: 'fixture' } });
  await f.rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'IUI_WORKING_DIRECTORY_NATIVE_PROBE' }], clientTimeZone: 'UTC' } });
  await until(async () => (await f.rpc('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId && !item.running && !item.blank));
  const nativeRequests = f.requests.filter(payload => payload.tools?.length);
  assert.equal(nativeRequests.length, 2, 'the native tool loop runs exactly one directory change');
  assert.ok(nativeRequests[0].tools.some(tool => tool.function.name === 'working_directory'));
  const contexts = nativeRequests.map(payload => payload.messages.filter(message => typeof message.content === 'string' && message.content.includes('Current runtime context.')).at(-1)?.content);
  assert.ok(contexts[0]?.includes(`Current working directory: ${JSON.stringify(f.cwd)}.`));
  assert.ok(contexts[1]?.includes(`Current working directory: ${JSON.stringify(nextCwd)}.`), 'the next actual model request receives the new current directory');
  assert.ok(!JSON.stringify(nativeRequests).includes('{{cwd}}'));
  const snapshot = await f.snapshot(sessionId);
  assert.equal(snapshot.header.cwd, f.cwd, 'changing current directory does not rewrite native session/project origin');
  assert.equal(snapshot.projections.values.workingDirectory, nextCwd);
  await f.page.locator(`[data-row-key="session:${sessionId}"]`).click();
  const input = f.page.getByLabel('目录切换后参数', { exact: true }); await input.waitFor(); await until(() => input.isEnabled());
  await input.fill('8');
  const surface = f.page.locator('[data-iui-block]').first();
  await until(async () => !/等待保存|正在保存|尚未保存/.test(await surface.innerText()));
  await f.page.reload(); await input.waitFor(); await until(() => input.isEnabled());
  assert.equal(await input.inputValue(), '8');
  assert.deepEqual(f.errors, []);
  await f.page.screenshot({ path: join(evidence, 'working-directory.png'), fullPage: true });
  await writeFile(join(evidence, 'requests.json'), JSON.stringify(nativeRequests, null, 2), { mode: 0o600 });
  await writeFile(join(evidence, 'snapshot.json'), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ hostVersion, preset: 'intelligent-chat', nativeTool: 'working_directory', beforeCwd: f.cwd, currentCwd: nextCwd, headerCwd: snapshot.header.cwd, modelRequests: nativeRequests.length, stateAfterReload: '8', externalModelRequests: 0 }, null, 2), { mode: 0o600 });
});
