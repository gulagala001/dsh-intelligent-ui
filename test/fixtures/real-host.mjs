import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import YAML from 'yaml';
import { createHash } from 'node:crypto';
import { hostFixture } from './host.mjs';

/** Only the explicitly selected route is read. Credentials never enter the host or evidence. */
async function loadAuthorizedRoute({ settingsPath, profileRouteFile, provider, model }) {
  if (profileRouteFile) {
    if (!provider || !model || /luna/i.test(model)) throw new Error('An explicit authorized provider and non-Luna model are required');
    const yaml = async path => {
      const doc = YAML.parseDocument(await readFile(path, 'utf8'), { logLevel: 'silent', customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] });
      if (doc.errors.length) throw new Error('Private route YAML could not be parsed safely');
      return doc.toJS();
    };
    const config = await yaml(profileRouteFile); let selected;
    const walk = value => { if (!value || typeof value !== 'object') return; if (value.providers?.[provider]) selected = value.providers[provider]; for (const child of Object.values(value)) if (typeof child === 'object') walk(child); };
    walk(config);
    const configuredModel = selected?.models?.find(entry => entry.id === model);
    if (!configuredModel) throw new Error('Explicit model is absent from selected configured provider');
    let key;
    for (const path of [join(dirname(profileRouteFile), '.credentials.yaml'), join(dirname(dirname(dirname(profileRouteFile))), '.credentials.yaml')]) {
      try { const data = await yaml(path); const value = data?.refs?.[selected.apiKeyEnv]; if (typeof value === 'string' && value) { key = value; break; } }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const modelDefinition=Object.fromEntries(['contextWindow','maxTokens','input','reasoningEfforts','compat'].filter(name=>configuredModel[name]!==undefined).map(name=>[name,configuredModel[name]]));
    const providerDefinition=selected.compat===undefined?{}:{compat:selected.compat};
    return { api: selected.api, baseURL: selected.baseURL, model, key, modelDefinition,providerDefinition, offeredReasoningEfforts: Object.keys(configuredModel.reasoningEfforts ?? {}), headers: Object.fromEntries(Object.entries(selected.headers ?? {}).filter(([,value]) => typeof value === 'string')) };
  }
  if (!settingsPath) throw new Error('Provide IUI_REAL_SETTINGS or an authorized --profile-route-file reference');
  const { main } = JSON.parse(await readFile(settingsPath, 'utf8'));
  return { api: main?.api, baseURL: main?.baseUrl, model: main?.model, key: main?.apiKey };
}

export function generatedTokenCount(call) {
  const tokens=call.usage?.completion_tokens;
  if(Number.isSafeInteger(tokens)&&tokens>=0)return tokens;
  return Buffer.byteLength((call.text??'')+(call.reasoning??'')+JSON.stringify(call.toolCalls??[]));
}

export async function realHostFixture(t, options = {}) {
  const { evidenceDirectory } = options;
  const route = await loadAuthorizedRoute(options);
  if (route.api !== 'openai-completions' || !route.baseURL || !route.model || !route.key) throw new Error('Selected main route must be a configured openai-completions model');
  await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
  const generatedTokenCeiling=options.generatedTokenCeiling??65536;
  if(!Number.isSafeInteger(generatedTokenCeiling)||generatedTokenCeiling<128||generatedTokenCeiling>131072)throw Error('Internal case output guard must be within 128..131072');
  const calls = [], auxiliary = []; let activeCase;
  const scrub = value => String(value).split(route.key).join('[redacted]');
  const write = async (name, value) => writeFile(join(evidenceDirectory, name), scrub(JSON.stringify(value, null, 2)), { mode: 0o600 });
  const usedTokens = generatedTokenCount;
  if(Object.values(options.priorGeneratedTokens??{}).some(count=>!Number.isSafeInteger(count)||count<0))throw Error('Historical generated-token counts must be nonnegative safe integers');
  const forward = async function* (payload) {
    // Native title generation is deliberately local and counted separately.
    if (!payload.tools?.length) { auxiliary.push({ kind: 'native-title', timestamp: Date.now() }); yield { delta: { content: '交互测试' }, finish_reason: 'stop' }; return; }
    if (!activeCase) throw new Error('No authorized test case is active');
    const preceding = (options.priorGeneratedTokens?.[activeCase] ?? 0) + calls.filter(call => call.case === activeCase).reduce((sum, call) => sum + usedTokens(call), 0);
    const remaining = generatedTokenCeiling - preceding;
    if (remaining < 128) throw Object.assign(new Error('Internal per-case generated-token guard exhausted'),{scope:'case-budget'});
    const requestCap = options.requestCap ?? 10;
    if (calls.filter(call => call.case === activeCase).length >= requestCap) throw Object.assign(new Error(`Explicit per-case model request cap (${requestCap}) reached`),{scope:'case-budget'});
    const number = calls.length + 1;
    const call = { number, case: activeCase, model: route.model, started: Date.now(), text: '', reasoning: '', toolCalls: [], usage: null, finished: false, outputTokenLimit: remaining,
      reasoningEffort: payload.reasoning_effort ?? null,
      nativeToolResults: payload.messages.filter(message => message.role === 'tool') };
    calls.push(call);
    const body = { ...payload, model: route.model, stream: true, stream_options: { ...payload.stream_options,include_usage: true } };
    const tokenFields=['max_tokens','max_completion_tokens'].filter(field=>Object.hasOwn(payload,field));
    if(!tokenFields.length)body.max_tokens=remaining;
    for(const field of tokenFields)body[field]=Math.min(remaining,payload[field]);
    call.outputTokenLimit=Math.min(remaining,...tokenFields.map(field=>body[field]));
    await write(`${String(number).padStart(2, '0')}-${call.case}-request.json`, body);
    const endpoint = route.baseURL.replace(/\/$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions';
    const response = await fetch(endpoint, {
      method: 'POST', headers: { ...route.headers, 'content-type': 'application/json', authorization: 'Bearer ' + route.key },
      body: JSON.stringify(body), signal: AbortSignal.timeout(240000),
    });
    if (!response.ok) {
      call.error = `Configured provider returned HTTP ${response.status}`;
      call.errorScope = 'route';
      await write(`${String(number).padStart(2, '0')}-${call.case}-provider-error.json`, { status: response.status, body: scrub(await response.text()) });
      yield { delta: { content: call.error }, finish_reason: 'stop' }; return;
    }
    let buffer = ''; const decoder = new TextDecoder();
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
          if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') continue;
          const item = JSON.parse(line.slice(5));
          if (item.usage) call.usage = item.usage;
          for (const choice of item.choices ?? []) {
            call.text += choice.delta?.content ?? '';
            call.reasoning += choice.delta?.reasoning_content ?? '';
            for (const fragment of choice.delta?.tool_calls ?? []) {
              let tool = call.toolCalls.find(item => item.index === fragment.index);
              if (!tool) { tool = { index: fragment.index, function: { name: '', arguments: '' } }; call.toolCalls.push(tool); }
              if (fragment.id) tool.id = fragment.id;
              if (fragment.function?.name) tool.function.name += fragment.function.name;
              if (fragment.function?.arguments) tool.function.arguments += fragment.function.arguments;
            }
            if (choice.finish_reason) { call.finishReason = choice.finish_reason; call.finished = true; }
          }
          yield item;
        }
      }
      call.streamCompleted=true;
    } finally {
      call.ended = Date.now();
      // Requests contain only the isolated test and publicly installed plugin rules/resources.
      await write(`${String(number).padStart(2, '0')}-${call.case}-response.json`, call);
      await write(`${String(number).padStart(2, '0')}-${call.case}-request.json`, { ...body, model: route.model });
    }
  };
  const reply = async function* (payload) {
    try { yield* forward(payload); }
    catch (error) {
      const call = calls.at(-1);
      if (call?.case === activeCase) { call.error = scrub(error.message);call.errorScope=error.scope??'route'; await write(`${String(call.number).padStart(2, '0')}-${call.case}-response.json`, call); }
      yield { delta: { content: 'Real-model acceptance request failed; see isolated evidence.' }, finish_reason: 'stop' };
    }
  };
  const fixture = await hostFixture(t, { reply,modelDefinition:route.modelDefinition,providerDefinition:route.providerDefinition,reasoningEffort:options.reasoningEffort });
  const packageSha256 = createHash('sha256').update(await readFile(fixture.tar)).digest('hex');
  const scrubEvidence = async () => {
    const matches = [];
    for (const name of await readdir(evidenceDirectory)) {
      if (!/\.(json|txt)$/.test(name)) continue;
      const path = join(evidenceDirectory, name), source = await readFile(path, 'utf8');
      if (source.includes(route.key)) { matches.push(path); await writeFile(path, scrub(source), { mode: 0o600 }); }
    }
    return { exactCredentialMatchesRedacted: matches.length, files: matches };
  };
  return { ...fixture, calls, auxiliary, model: route.model, modelDefinition:route.modelDefinition??{},generatedTokenCeiling,offeredReasoningEfforts: route.offeredReasoningEfforts ?? [], packageSha256, setCase: id => { activeCase = id; }, writeEvidence: write, scrub, scrubEvidence, usedTokens };
}
