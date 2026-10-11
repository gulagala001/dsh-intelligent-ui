import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import YAML from 'yaml';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
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
  const tokens=call.usage?.completion_tokens??call.nativeUsage?.outputTokens;
  if(Number.isSafeInteger(tokens)&&tokens>=0)return tokens;
  return Buffer.byteLength((call.text??'')+(call.reasoning??'')+JSON.stringify(call.toolCalls??[]));
}

/** Project exactly the authorized default account; never clone refresh authority. */
export function isolatedCodexAccount(document,{now=Date.now(),requiredValidForMs=1800000}={}){
  if(!Number.isSafeInteger(requiredValidForMs)||requiredValidForMs<120000)throw Error('Native acceptance validity window must be at least two minutes');
  const entry=document?.codex,session=entry?.accounts?.[entry.default];
  if(typeof entry?.default!=='string'||typeof session?.accessToken!=='string'||!session.accessToken||typeof session.accountId!=='string'||!session.accountId||!Number.isFinite(session.expiresAt))throw Error('The selected default Codex account is not usable');
  // AccountTokenManager proactively refreshes inside its five-minute window.
  if(session.expiresAt<=now+requiredValidForMs+300000)throw Error('The selected Codex access token expires before the complete acceptance window; refresh is disabled');
  return{store:{codex:{default:'fixture-default',accounts:{'fixture-default':{accessToken:session.accessToken,accountId:session.accountId,expiresAt:session.expiresAt,refreshToken:'fixture-refresh-disabled'}}}},secrets:[session.accessToken,session.accountId],expiresAt:session.expiresAt};
}

/** Scoped to the isolated host. No OAuth refresh or incidental network discovery. */
export function nativeCodexFetchGuard(fetchImpl,{readBudget,appendAudit,onFailure,timeoutMs=240000,now=Date.now}){
  const dispatches=new Map();
  return async function(input,init){
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(['http:','https:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))return fetchImpl(input,init);
    if(url.href!=='https://chatgpt.com/backend-api/codex/responses')throw Error('Isolated native acceptance blocked an unrelated external request; OAuth refresh is disabled');
    const budget=readBudget();
    if(!budget?.case||!Number.isFinite(budget.deadline)||now()>=budget.deadline)throw Error('No active unexpired native acceptance case permits an external request');
    const count=dispatches.get(budget.case)??0;
    if(count>=budget.requestCap)throw Error('Explicit per-case native provider request cap reached');
    dispatches.set(budget.case,count+1);
    appendAudit({case:budget.case,number:count+1,started:now(),kind:'native-codex-dispatch'});
    const originalSignal=init?.signal??(typeof input==='object'?input.signal:undefined),signal=originalSignal?AbortSignal.any([originalSignal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
    const response=await fetchImpl(input,{...init,signal,redirect:'error'});
    if(!response.ok&&onFailure)await onFailure({status:response.status,body:await response.clone().text()});
    return response;
  };
}

/** Public-stream recording only; credential and provider-private replay fields are excluded. */
export function nativeAcceptanceObserver({model,write,scrub=value=>String(value),generatedTokenCeiling=65536,requestCap=10,priorGeneratedTokens={}}){
  if(!Number.isSafeInteger(generatedTokenCeiling)||generatedTokenCeiling<128||generatedTokenCeiling>131072)throw Error('Internal case output guard must be within 128..131072');
  if(!Number.isInteger(requestCap)||requestCap<1||requestCap>16)throw Error('Explicit request cap must be within 1..16');
  if(Object.values(priorGeneratedTokens).some(count=>!Number.isSafeInteger(count)||count<0))throw Error('Historical generated-token counts must be nonnegative safe integers');
  const calls=[],auxiliary=[],blocks=new Map();let activeCase;
  const file=(call,suffix)=>`${String(call.number).padStart(2,'0')}-${call.case}-${suffix}.json`;
  const fail=(call,message,scope='route')=>{call.error=scrub(message);call.errorScope=String(message).includes('per-case native provider request cap')?'case-budget':scope;return{error:call.error};};
  const handle=async event=>{
    if(event.kind==='auxiliary'){auxiliary.push({kind:'native-title',timestamp:Date.now()});return{};}
    if(event.kind==='provider-error'){
      const call=calls.findLast(item=>item.case===activeCase&&item.requestSent&&!item.ended);
      if(!call)return{error:'A native provider error has no active call'};
      (call.providerErrors??=[]).push({status:event.status,body:scrub(event.body)});
      await write(file(call,'provider-error'),call.providerErrors);return{};
    }
    if(event.kind==='start'){
      if(!activeCase)return{error:'No authorized test case is active'};
      const request=event.request,preceding=(priorGeneratedTokens[activeCase]??0)+calls.filter(call=>call.case===activeCase).reduce((sum,call)=>sum+generatedTokenCount(call),0),remaining=generatedTokenCeiling-preceding;
      const call={number:calls.length+1,case:activeCase,model,api:'native-codex-subscriptions',started:Date.now(),text:'',reasoning:'',toolCalls:[],usage:null,finished:false,streamCompleted:false,requestSent:false,outputTokenLimit:Math.max(0,remaining),outputGuard:'client-generated-output-and-terminal-usage',reasoningEffort:request?.reasoningEffort??null,nativeToolResults:(request?.messages??[]).filter(message=>message.role==='tool')};
      const previousRequests=calls.filter(item=>item.case===activeCase&&item.requestSent).length;
      const concurrentRequest=calls.some(item=>item.case===activeCase&&item.requestSent&&!item.ended);
      calls.push(call);blocks.set(call.number,new Map());
      let rejection;
      if(request?.provider!=='codex'||request.model!==model)rejection=fail(call,'Native observer received an unauthorized provider or model');
      else if(concurrentRequest)rejection=fail(call,'Concurrent main model requests in one native acceptance case are not permitted','case-budget');
      else if(remaining<128)rejection=fail(call,'Internal per-case generated-token guard exhausted','case-budget');
      else if(previousRequests>=requestCap)rejection=fail(call,`Explicit per-case model request cap (${requestCap}) reached`,'case-budget');
      // Reserve the stream slot synchronously, before request evidence I/O yields.
      if(rejection)call.ended=Date.now();else call.requestSent=true;
      try{
        await write(file(call,'request'),request);
        if(rejection){await write(file(call,'response'),call);return rejection;}
        return{callId:call.number};
      }catch(error){
        call.requestSent=false;call.ended=Date.now();const result=fail(call,'Native request evidence could not be written: '+String(error?.message??error),'fixture');
        try{await write(file(call,'response'),call);}catch{/* The in-memory failure is already observable by the acceptance runner. */}
        return result;
      }
    }
    const call=calls.find(item=>item.number===event.callId);
    if(!call)return{error:'Native model observer call identity is invalid'};
    if(event.kind==='chunk'){
      const chunk=event.chunk,content=blocks.get(call.number);let block=content.get(chunk.index);
      if(chunk.type==='text-delta'||chunk.type==='reasoning-delta'){if(!block){block={type:chunk.type==='text-delta'?'text':'reasoning',text:''};content.set(chunk.index,block);}block.text+=chunk.text??'';}
      if(chunk.type==='tool-call-delta'){
        let tool=call.toolCalls.find(item=>item.index===chunk.index);if(!tool){tool={index:chunk.index,function:{name:'',arguments:''}};call.toolCalls.push(tool);}if(chunk.id)tool.id=chunk.id;if(chunk.name)tool.function.name=chunk.name;tool.function.arguments+=chunk.argumentsDelta??'';
      }
      if(chunk.type==='block-end'){
        if(['text','reasoning'].includes(chunk.block?.type))content.set(chunk.index,{type:chunk.block.type,text:chunk.block.text??''});
        if(chunk.block?.type==='tool-call'){let tool=call.toolCalls.find(item=>item.index===chunk.index);if(!tool){tool={index:chunk.index,function:{}};call.toolCalls.push(tool);}tool.id=chunk.block.id;tool.function={name:chunk.block.name,arguments:chunk.block.arguments};}
      }
      call.text=[...content.entries()].sort(([a],[b])=>a-b).filter(([,item])=>item.type==='text').map(([,item])=>item.text).join('');
      call.reasoning=[...content.entries()].sort(([a],[b])=>a-b).filter(([,item])=>item.type==='reasoning').map(([,item])=>item.text).join('');
      if(chunk.type==='usage'){call.nativeUsage=chunk.usage;call.usage={prompt_tokens:chunk.usage.inputTokens,completion_tokens:chunk.usage.outputTokens,...(chunk.usage.totalTokens===undefined?{}:{total_tokens:chunk.usage.totalTokens})};}
      const caseGenerated=(priorGeneratedTokens[call.case]??0)+calls.filter(item=>item.case===call.case).reduce((sum,item)=>sum+generatedTokenCount(item),0);
      if(generatedTokenCount(call)>call.outputTokenLimit||caseGenerated>generatedTokenCeiling)return fail(call,'Internal per-case generated-token output guard exceeded','case-budget');
      if(chunk.type==='finish'){
        call.nativeFinishReason=chunk.reason;call.finishReason=({'tool-calls':'tool_calls','max-tokens':'length',stop:'stop',error:'error',aborted:'aborted'})[chunk.reason?.kind]??'error';
        if(['error','aborted'].includes(call.finishReason))fail(call,chunk.reason?.failure?.message??'Native provider did not complete successfully');else call.finished=true;
      }
      return{};
    }
    if(event.kind==='end'){
      call.ended=Date.now();call.streamCompleted=Boolean(event.completed);
      if(event.error&&!call.error)fail(call,event.error);
      if(!event.completed&&!call.error)fail(call,'Native model stream was cancelled before completion');
      if(event.completed&&!call.finished&&!call.error)fail(call,'Native model stream ended without a successful finish reason');
      await write(file(call,'response'),call);return{};
    }
    return{error:'Native observer event is unsupported'};
  };
  return{calls,auxiliary,handle,setCase:id=>{activeCase=id;}};
}

async function nativeCodexHostFixture(t,options){
  const selected=options.nativeCodexSubscriptions;
  if(options.settingsPath||options.profileRouteFile||options.provider)throw Error('Native Codex subscription acceptance cannot mix configured API routes');
  if(!selected?.packagePath||!selected.authFile||selected.model!=='gpt-6.1-sol')throw Error('Select the subscriptions package, authorized default-account file, and gpt-6.1-sol model');
  const requiredValidForMs=selected.requiredValidForMs??1800000,started=Date.now();
  const account=isolatedCodexAccount(JSON.parse(await readFile(selected.authFile,'utf8')),{now:started,requiredValidForMs});
  const scrub=value=>account.secrets.reduce((text,secret)=>text.split(secret).join('[redacted]'),String(value));
  const evidenceDirectory=options.evidenceDirectory;await mkdir(evidenceDirectory,{recursive:true,mode:0o700});
  const write=async(name,value)=>writeFile(join(evidenceDirectory,name),scrub(JSON.stringify(value,null,2)),{mode:0o600});
  const generatedTokenCeiling=options.generatedTokenCeiling??65536,requestCap=options.requestCap??10,timeoutMs=selected.timeoutMs??240000;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000)throw Error('Native acceptance stream deadline must be within 1000..300000 ms');
  const observer=nativeAcceptanceObserver({model:selected.model,write,scrub,generatedTokenCeiling,requestCap,priorGeneratedTokens:options.priorGeneratedTokens});
  const modelDefinition={contextWindow:872000,maxTokens:128000,input:['text','image']};let budgetFile,auditFile;
  const fixture=await hostFixture(t,{
    nativeModel:{provider:'codex',model:selected.model},reasoningEffort:options.reasoningEffort??'high',
    extraPackages:[...(process.env.IUI_TEST_OMD_PACKAGE?['file:'+process.env.IUI_TEST_OMD_PACKAGE]:[]),'file:'+selected.packagePath],
    nativeSettings:{'llm-subscriptions':{providers:['codex'],legacyCodexRoute:false,streamIdleTimeoutMs:timeoutMs,rateLimit:{wait:false,maxWaitMs:1},models:{codex:[{id:selected.model,name:'GPT-6.1 Sol',contextWindow:modelDefinition.contextWindow,maxTokens:modelDefinition.maxTokens,inputModalities:modelDefinition.input}]},pool:{enabled:false,autoAccounts:false,autoFamilies:false}}},
    nativeObserver:{handle:observer.handle,timeoutMs},redact:scrub,
    initializeHome:async({root,home,nativeObserverEndpoint})=>{
      const authDirectory=join(home,'plugins','subscriptions');await mkdir(authDirectory,{recursive:true,mode:0o700});await writeFile(join(authDirectory,'auth.json'),JSON.stringify(account.store),{mode:0o600});
      budgetFile=join(root,'native-case-budget.json');auditFile=join(evidenceDirectory,'native-network-dispatches.jsonl');await writeFile(budgetFile,'{}',{mode:0o600});await writeFile(auditFile,'',{mode:0o600});
      const preload=join(root,'native-codex-network-guard.mjs');
      await writeFile(preload,`import {readFileSync,appendFileSync} from 'node:fs';\nconst guard=${nativeCodexFetchGuard.toString()},original=globalThis.fetch;\nglobalThis.fetch=guard(original,{timeoutMs:${JSON.stringify(timeoutMs)},readBudget:()=>JSON.parse(readFileSync(${JSON.stringify(budgetFile)},'utf8')),appendAudit:value=>appendFileSync(${JSON.stringify(auditFile)},JSON.stringify(value)+'\\n',{mode:0o600}),onFailure:async failure=>{const response=await original(${JSON.stringify(nativeObserverEndpoint)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'provider-error',...failure}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Native provider failure evidence could not be recorded');}});\n`,{mode:0o600});
      return{preloadPaths:[preload]};
    },
  });
  const packageSha256=createHash('sha256').update(await readFile(fixture.tar)).digest('hex');
  const scrubEvidence=async()=>{const files=[];for(const name of await readdir(evidenceDirectory)){if(!/\.(json|jsonl|txt)$/.test(name))continue;const path=join(evidenceDirectory,name),source=await readFile(path,'utf8'),clean=scrub(source);if(clean!==source){files.push(path);await writeFile(path,clean,{mode:0o600});}}return{exactCredentialMatchesRedacted:files.length,files};};
  return{...fixture,...observer,model:selected.model,modelDefinition,generatedTokenCeiling,offeredReasoningEfforts:['minimal','low','medium','high','xhigh'],packageSha256,
    nativeProvider:'codex',nativeProtocol:'openai-codex-responses',subscriptionsPackageSha256:createHash('sha256').update(await readFile(selected.packagePath)).digest('hex'),
    setCase:id=>{observer.setCase(id);writeFileSync(budgetFile,JSON.stringify({case:id,requestCap,deadline:started+requiredValidForMs}),{mode:0o600});},
    writeEvidence:write,scrub,scrubEvidence,usedTokens:generatedTokenCount,
  };
}

export async function realHostFixture(t, options = {}) {
  if(options.nativeCodexSubscriptions)return nativeCodexHostFixture(t,options);
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
