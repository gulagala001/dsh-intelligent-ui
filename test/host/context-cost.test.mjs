import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { hostFixture, until } from '../fixtures/host.mjs';
import { skillContent, skillSummary } from '../../src/host/skill.mjs';

const plainQuestion = 'IUI_CONTEXT_COST_PUBLIC_PROBE: Reply with the word OK only.';
const toolsByName = payload => Object.fromEntries((payload.tools ?? []).map(tool => [tool.function.name, tool]));
const messagesText = payload => JSON.stringify(payload.messages);
const metrics = payload => ({
  requestChars: JSON.stringify(payload).length,
  messageChars: messagesText(payload).length,
  systemChars: JSON.stringify(payload.messages.filter(message => message.role === 'system')).length,
  toolSchemaChars: JSON.stringify(payload.tools ?? []).length,
  toolCount: payload.tools?.length ?? 0,
});

async function ask(fixture, preset, expectedRequests = 1) {
  const workspaceId = fixture.workspace.workspace.workspaceId;
  assert.ok(workspaceId, 'native fixture must expose the actual registered Workspace');
  const { sessionId } = await fixture.rpc('session/create', {
    request: { workspaceId, agentPreset: preset },
  });
  await fixture.rpc('session/selectModel', { request: { sessionId, provider: 'fixture', model: 'fixture' } });
  const before = fixture.requests.length;
  const accepted = await fixture.rpc('session/prompt', { request: {
    requestId: crypto.randomUUID(), sessionId, mode: 'queue',
    content: [{ type: 'text', text: plainQuestion }], clientTimeZone: 'UTC',
  } });
  assert.equal(accepted.accepted, true);
  const requests = await until(async () => {
    const actual = fixture.requests.slice(before).filter(payload => payload.tools?.length);
    if (actual.length < expectedRequests) return false;
    const { items } = await fixture.rpc('session/list', { _request: {} });
    const session = items.find(item => item.sessionId === sessionId);
    return session && !session.running && !session.blank ? actual : false;
  }, 60000);
  assert.equal(requests.length, expectedRequests, 'mock response must terminate the real native tool loop');
  return requests;
}

test('native request context: ordinary agents keep a short skill index and unchanged tools; skill and dedicated preset load the catalog on demand', { timeout: 240000 }, async t => {
  const evidence = resolve(process.env.IUI_CONTEXT_EVIDENCE ?? join('work/context-cost', new Date().toISOString().replace(/[:.]/g, '-')));
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  const baseline = await hostFixture(t, { plugin: false, reply: 'OK' });
  const [bare] = await ask(baseline, 'standard');
  await writeFile(join(evidence, 'pluginFalseOrdinary.json'), JSON.stringify(bare, null, 2), { mode: 0o600 });
  assert.ok(!messagesText(bare).includes(skillSummary), 'an uninstalled plugin must add no UI skill description');
  assert.ok(!messagesText(bare).includes('Installed base catalog'), 'an uninstalled plugin must add no UI catalog');

  let mode = 'ordinary';
  const installed = await hostFixture(t, { reply: payload => {
    if (mode === 'skill' && payload.tools?.length && !payload.messages.some(message => message.role === 'tool' && JSON.stringify(message.content).includes('Installed base catalog'))) {
      return [{ delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'context-cost-native-skill', type: 'function',
        function: { name: 'skill', arguments: JSON.stringify({ name: 'intelligent-ui' }) } }] }, finish_reason: 'tool_calls' }];
    }
    return [{ delta: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }];
  } });
  const [ordinary] = await ask(installed, 'standard');
  await writeFile(join(evidence, 'pluginTrueOrdinary.json'), JSON.stringify(ordinary, null, 2), { mode: 0o600 });
  const ordinaryText = messagesText(ordinary);
  assert.ok(ordinaryText.includes(skillSummary), 'ordinary native agent sees the short installed skill description');
  assert.ok(!ordinaryText.includes('Installed base catalog'), 'ordinary native agent must not receive catalog body');
  assert.ok(!ordinaryText.includes('Calculator argument schema'), 'ordinary native agent must not receive component schemas');
  assert.deepEqual(toolsByName(ordinary), toolsByName(bare), 'installing the UI plugin must not change ordinary native tool schemas');

  mode = 'skill';
  const [beforeSkill, afterSkill] = await ask(installed, 'standard', 2);
  assert.ok(!messagesText(beforeSkill).includes('Installed base catalog'), 'skill content is absent before invocation');
  const nativeToolResult = afterSkill.messages.filter(message => message.role === 'tool');
  assert.ok(JSON.stringify(nativeToolResult).includes('Installed base catalog'), 'actual native skill tool returns the installed catalog');
  assert.ok(JSON.stringify(nativeToolResult).includes('Calculator argument schema'), 'skill result carries authoritative calculator objects');
  assert.deepEqual(toolsByName(afterSkill), toolsByName(ordinary), 'native skill loading does not expand ordinary tool schemas');

  mode = 'dedicated';
  const [dedicated] = await ask(installed, 'intelligent-chat');
  const dedicatedSystem = JSON.stringify(dedicated.messages.filter(message => message.role === 'system'));
  assert.ok(dedicatedSystem.includes('Installed base catalog'), 'dedicated native preset includes its own catalog section');
  assert.ok(dedicatedSystem.includes('Calculator argument schema'));
  // Inspect decoded content: serializing messages escapes Windows paths again.
  // Older hosts interpolate the persona suffix; newer hosts JSON-quote runtime cwd.
  const cwdContexts = [`Your working directory is ${installed.cwd}.`, `Current working directory: ${JSON.stringify(installed.cwd)}.`];
  assert.ok(dedicated.messages.some(message => typeof message.content === 'string'
    && cwdContexts.some(context => message.content.includes(context))), 'the actual assembled dedicated request includes its current native working directory');
  assert.ok(!messagesText(dedicated).includes('{{cwd}}'), 'the retired cwd template never reaches a model request');
  const plainAfterDedicated = await ask(installed, 'standard');
  assert.ok(!messagesText(plainAfterDedicated[0]).includes('Installed base catalog'), 'dedicated scope must not leak into a later ordinary session');
  assert.deepEqual(toolsByName(plainAfterDedicated[0]), toolsByName(bare));
  assert.deepEqual([...baseline.errors, ...installed.errors], []);

  const ordinaryDelta = metrics(ordinary).messageChars - metrics(bare).messageChars;
  assert.ok(ordinaryDelta > 0 && ordinaryDelta < 2048, `ordinary plugin overhead must stay a short index, observed ${ordinaryDelta} characters`);
  const records = { pluginFalseOrdinary: bare, pluginTrueOrdinary: ordinary, ordinaryBeforeSkill: beforeSkill, ordinaryAfterNativeSkill: afterSkill, dedicatedIntelligentChat: dedicated, ordinaryAfterDedicated: plainAfterDedicated[0] };
  for (const [name, payload] of Object.entries(records)) await writeFile(join(evidence, `${name}.json`), JSON.stringify(payload, null, 2), { mode: 0o600 });
  const summary = {
    mode: 'packaged-native-request-character-comparison-with-local-mock-provider',
    health: (await installed.api('/health')).body,
    packageSha256: createHash('sha256').update(await readFile(installed.tar)).digest('hex'),
    measurements: Object.fromEntries(Object.entries(records).map(([name, payload]) => [name, metrics(payload)])),
    messageCharacterDeltas: {
      ordinaryPluginIndex: ordinaryDelta,
      actualNativeSkillFollowup: metrics(afterSkill).messageChars - metrics(beforeSkill).messageChars,
      dedicatedVersusOrdinary: metrics(dedicated).messageChars - metrics(ordinary).messageChars,
    },
    installedSkillContentChars: skillContent().length,
    ordinaryToolSchemasIdentical: true, ordinaryContextScopeRestored: true,
    actualNativeSkillInvocation: true, realExternalModelRequests: 0,
    accounting: 'UTF-16 string lengths in captured native payloads only; not tokenizer counts or billed tokens. Presets may carry different native instructions and tool sets.',
  };
  await writeFile(join(evidence, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  t.diagnostic(`Native character deltas: ordinary index ${ordinaryDelta}; actual skill follow-up ${summary.messageCharacterDeltas.actualNativeSkillFollowup}; dedicated versus ordinary ${summary.messageCharacterDeltas.dedicatedVersusOrdinary}. No external model requests.`);
});
