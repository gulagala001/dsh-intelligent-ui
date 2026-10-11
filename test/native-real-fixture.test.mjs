import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { hostFixture, until, applyNativeModelObserver } from './fixtures/host.mjs';
import { isolatedCodexAccount, nativeCodexFetchGuard, nativeAcceptanceObserver, generatedTokenCount } from './fixtures/real-host.mjs';

test('native account projection discards other accounts, refresh authority and identity fields',()=>{
  const now=1000,session={accessToken:'selected-access',refreshToken:'real-refresh',accountId:'selected-account',expiresAt:now+2400000,emailAddress:'private@example.invalid',idToken:'private-id-token'};
  const selected=isolatedCodexAccount({codex:{default:'private-key',accounts:{'private-key':session,other:{accessToken:'other-access'}}},claude:{accessToken:'other-provider'}},{now,requiredValidForMs:1800000});
  assert.deepEqual(Object.keys(selected.store),['codex']);
  assert.deepEqual(Object.keys(selected.store.codex.accounts),['fixture-default']);
  assert.deepEqual(Object.keys(selected.store.codex.accounts['fixture-default']).sort(),['accessToken','accountId','expiresAt','refreshToken']);
  assert.equal(selected.store.codex.accounts['fixture-default'].refreshToken,'fixture-refresh-disabled');
  for(const secret of ['real-refresh','private-key','private@example.invalid','private-id-token','other-access'])assert.equal(JSON.stringify(selected.store).includes(secret),false);
  assert.throws(()=>isolatedCodexAccount({codex:{default:'default',accounts:{default:{...session,expiresAt:now+2100000}}}},{now,requiredValidForMs:1800000}),/expires before/);
});

test('native egress guard rejects refresh and inactive/expired cases, caps dispatch and propagates cancellation',async()=>{
  const records=[],seen=[];let budget={},now=1000;
  const guarded=nativeCodexFetchGuard(async(input,init)=>{seen.push({input,signal:init?.signal,redirect:init?.redirect});return new Response('offline');},{readBudget:()=>budget,appendAudit:value=>records.push(value),now:()=>now});
  const endpoint='https://chatgpt.com/backend-api/codex/responses';
  await assert.rejects(guarded('https://auth.openai.com/oauth/token'),/refresh is disabled/);
  await assert.rejects(guarded(endpoint),/No active/);
  await guarded('http://127.0.0.1:12345/offline');assert.equal(records.length,0);
  budget={case:'one',deadline:2000,requestCap:1};const controller=new AbortController();
  await guarded(endpoint,{signal:controller.signal});controller.abort();assert.equal(seen.at(-1).signal.aborted,true);
  assert.equal(seen.at(-1).redirect,'error');
  await assert.rejects(guarded(endpoint),/cap reached/);assert.equal(records.length,1);
  budget={...budget,case:'two'};await guarded(endpoint);assert.equal(records.length,2);
  now=2000;await assert.rejects(guarded(endpoint),/No active/);
  assert.equal(JSON.stringify(records).includes('authorization'),false);
  let failure;const failed=nativeCodexFetchGuard(async()=>new Response('original provider failure',{status:401}),{readBudget:()=>({case:'failed',deadline:3000,requestCap:1}),appendAudit:()=>{},onFailure:value=>{failure=value;},now:()=>2000});
  assert.equal((await failed(endpoint)).status,401);assert.deepEqual(failure,{status:401,body:'original provider failure'});
});

test('an initialization failure after an access-token copy still closes the provider and removes the isolated home',async()=>{
  const cleanup=[];let owned;
  await assert.rejects(hostFixture({passed:true,after:fn=>cleanup.push(fn),diagnostic:()=>{}},{plugin:false,nativeModel:{provider:'codex',model:'gpt-6.1-sol'},initializeHome:async({root,home,nativeObserverEndpoint})=>{
    owned={root,home,endpoint:nativeObserverEndpoint};const auth=join(home,'plugins','subscriptions');await mkdir(auth,{recursive:true});await writeFile(join(auth,'auth.json'),'{"accessToken":"offline-copy"}',{mode:0o600});throw Object.assign(Error('controlled post-copy initialization failure'),{code:'EIO'});
  }}),/controlled post-copy/);
  assert.equal(cleanup.length,1);assert.equal((await lstat(join(owned.home,'plugins','subscriptions','auth.json'))).isFile(),true);
  for(const close of cleanup.reverse())await close();
  await assert.rejects(lstat(owned.root),{code:'ENOENT'});
  await assert.rejects(fetch(owned.endpoint),/fetch failed/);
});

test('native recording retains text/tool results/usage without duplicating block-end data and fails truncated or unfinished streams',async()=>{
  const files=new Map(),recording=nativeAcceptanceObserver({model:'gpt-6.1-sol',write:async(name,value)=>files.set(name,structuredClone(value)),generatedTokenCeiling:1024,requestCap:1});
  recording.setCase('case');
  const {callId}=await recording.handle({kind:'start',request:{provider:'codex',model:'gpt-6.1-sol',messages:[{role:'tool',toolCallId:'offline-call',content:[{type:'text',text:'public resource'}]}]}});
  for(const chunk of [{type:'text-delta',index:0,text:'partial'},{type:'block-end',index:0,block:{type:'text',text:'complete'}},{type:'tool-call-delta',index:1,id:'call',name:'skill',argumentsDelta:'{"name":'},{type:'block-end',index:1,block:{type:'tool-call',id:'call',name:'skill',arguments:'{"name":"intelligent-ui"}'}},{type:'usage',usage:{inputTokens:10,outputTokens:12,reasoningTokens:2}},{type:'finish',reason:{kind:'tool-calls'}}])assert.deepEqual(await recording.handle({kind:'chunk',callId,chunk}),{});
  await recording.handle({kind:'end',callId,completed:true});
  assert.equal(recording.calls[0].text,'complete');assert.equal(recording.calls[0].toolCalls[0].function.arguments,'{"name":"intelligent-ui"}');
  assert.equal(recording.calls[0].finishReason,'tool_calls');assert.equal(recording.calls[0].streamCompleted,true);assert.equal(generatedTokenCount(recording.calls[0]),12);
  assert.ok((await recording.handle({kind:'start',request:{provider:'codex',model:'gpt-6.1-sol'}})).error.includes('cap'));
  const incomplete=nativeAcceptanceObserver({model:'gpt-6.1-sol',write:async()=>{}});incomplete.setCase('incomplete');const started=await incomplete.handle({kind:'start',request:{provider:'codex',model:'gpt-6.1-sol'}});await incomplete.handle({kind:'end',callId:started.callId,completed:true});assert.ok(incomplete.calls[0].error.includes('finish reason'));
  const exceeded=nativeAcceptanceObserver({model:'gpt-6.1-sol',write:async()=>{},generatedTokenCeiling:128});exceeded.setCase('budget');const pending=await exceeded.handle({kind:'start',request:{provider:'codex',model:'gpt-6.1-sol'}});assert.ok((await exceeded.handle({kind:'chunk',callId:pending.callId,chunk:{type:'text-delta',index:0,text:'x'.repeat(129)}})).error.includes('guard exceeded'));
  const protectedFiles=new Map(),protectedObserver=nativeAcceptanceObserver({model:'gpt-6.1-sol',write:async(name,value)=>protectedFiles.set(name,value),scrub:value=>String(value).split('private-access').join('[redacted]')});protectedObserver.setCase('failure');await protectedObserver.handle({kind:'start',request:{provider:'codex',model:'gpt-6.1-sol'}});await protectedObserver.handle({kind:'provider-error',status:401,body:'HTTP failure private-access'});assert.equal(JSON.stringify([...protectedFiles.values()]).includes('private-access'),false);assert.ok([...protectedFiles.keys()].some(name=>name.endsWith('-provider-error.json')));
});

test('public streaming observer short-circuits titles, strips private fields and preserves native chunks',async t=>{
  const events=[];const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const event=JSON.parse(body);events.push(event);res.setHeader('content-type','application/json');res.end(JSON.stringify(event.kind==='start'?{callId:1}:{}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  let intercept;applyNativeModelObserver({on:(name,fn)=>{assert.equal(name,'llm/stream');intercept=fn;}},{endpoint:`http://127.0.0.1:${server.address().port}`,timeoutMs:1000});
  const title=[];for await(const chunk of intercept({purpose:'session-title'},()=>{throw Error('Title must remain local');}))title.push(chunk);assert.equal(title.at(-1).reason.kind,'stop');assert.deepEqual(events,[{kind:'auxiliary',purpose:'session-title'}]);
  events.length=0;const native=[{type:'text-delta',index:0,text:'public answer',providerSecrets:'private'},{type:'finish',reason:{kind:'stop'},replayState:{privateSignature:'private-replay'}}];
  const result=[];for await(const chunk of intercept({provider:'codex',model:'gpt-6.1-sol',authorization:'private-token',messages:[{role:'user',content:[{type:'text',text:'public test',credential:'private-input'}]}]},async function*(){yield* native;}))result.push(chunk);
  assert.deepEqual(result,native);assert.equal(JSON.stringify(events).includes('private'),false);assert.equal(events.at(-1).completed,true);
});

test('one case rejects concurrent native streams and checks the complete live generated-token ledger',async()=>{
  const observer=nativeAcceptanceObserver({model:'gpt-6.1-sol',write:async()=>{},generatedTokenCeiling:256,requestCap:2});observer.setCase('concurrent');
  const request={provider:'codex',model:'gpt-6.1-sol'},first=await observer.handle({kind:'start',request});
  const second=await observer.handle({kind:'start',request});assert.ok(second.error.includes('Concurrent'));assert.equal(observer.calls[1].requestSent,false);assert.equal(observer.calls[1].errorScope,'case-budget');
  assert.deepEqual(await observer.handle({kind:'chunk',callId:first.callId,chunk:{type:'text-delta',index:0,text:'x'.repeat(140)}}),{});
  assert.deepEqual(await observer.handle({kind:'chunk',callId:first.callId,chunk:{type:'text-delta',index:0,text:'x'.repeat(112)}}),{});
  assert.equal(observer.calls.reduce((sum,call)=>sum+generatedTokenCount(call),0),256);
  assert.ok((await observer.handle({kind:'chunk',callId:first.callId,chunk:{type:'text-delta',index:0,text:'x'}})).error.includes('guard exceeded'));
  assert.ok(generatedTokenCount(observer.calls[0])<=observer.calls[0].outputTokenLimit,'The complete case ledger, including other attempts, enforces the ceiling');
});

test('native start reserves its slot before deferred evidence writes and reports write failure immediately',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const observer=nativeAcceptanceObserver({model:'gpt-6.1-sol',requestCap:1,write:async name=>{if(name.endsWith('-request.json'))await gate;}});observer.setCase('deferred');
  const request={provider:'codex',model:'gpt-6.1-sol'},first=observer.handle({kind:'start',request}),second=observer.handle({kind:'start',request});
  assert.equal(observer.calls.filter(call=>call.requestSent&&!call.ended).length,1,'Only one slot may be reserved while its request write is pending');
  release();const results=await Promise.all([first,second]);assert.equal(results.filter(result=>result.callId).length,1);assert.ok(results[1].error.includes('Concurrent'));
  const failure=nativeAcceptanceObserver({model:'gpt-6.1-sol',write:async()=>{throw Error('controlled evidence EIO');}});failure.setCase('write-failure');
  const result=await failure.handle({kind:'start',request});assert.ok(result.error.includes('controlled evidence EIO'));assert.equal(failure.calls[0].errorScope,'fixture');assert.equal(failure.calls[0].requestSent,false);assert.ok(failure.calls[0].ended);assert.equal(failure.calls[0].finished,false);
});

test('installed alpha.2 subscriptions adapter runs native Responses in an offline isolated DSH host',{timeout:240000,skip:!process.env.IUI_TEST_SUBSCRIPTIONS_PACKAGE},async t=>{
  const packagePath=process.env.IUI_TEST_SUBSCRIPTIONS_PACKAGE,files=new Map(),observer=nativeAcceptanceObserver({model:'gpt-6.1-sol',write:async(name,value)=>files.set(name,structuredClone(value))});observer.setCase('offline-native');
  const text='OFFLINE_NATIVE_CODEX_ANSWER',events=[{type:'response.created',response:{id:'offline-response'}},{type:'response.output_item.added',output_index:0,item:{type:'message',id:'offline-message',role:'assistant',content:[]}},{type:'response.output_text.delta',output_index:0,item_id:'offline-message',content_index:0,delta:text},{type:'response.output_item.done',output_index:0,item:{type:'message',id:'offline-message',role:'assistant',content:[{type:'output_text',text,annotations:[]}]}},{type:'response.completed',response:{id:'offline-response',status:'completed',usage:{input_tokens:12,output_tokens:8}}}];
  const sse=events.map(event=>'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n').join('');let dispatchFile;
  const f=await hostFixture(t,{plugin:false,extraPackages:['file:'+packagePath],nativeModel:{provider:'codex',model:'gpt-6.1-sol'},reasoningEffort:'high',nativeSettings:{'llm-subscriptions':{providers:['codex'],legacyCodexRoute:false,models:{codex:[{id:'gpt-6.1-sol',name:'offline fixture',contextWindow:872000,maxTokens:128000,inputModalities:['text','image']}]},pool:{enabled:false,autoAccounts:false,autoFamilies:false}}},nativeObserver:{handle:observer.handle},initializeHome:async({root,home})=>{
    const auth=join(home,'plugins','subscriptions');await mkdir(auth,{recursive:true});await writeFile(join(auth,'auth.json'),JSON.stringify({codex:{default:'fixture-default',accounts:{'fixture-default':{accessToken:'offline-access-only',refreshToken:'fixture-refresh-disabled',accountId:'offline-account',expiresAt:Date.now()+7200000}}}}),{mode:0o600});
    dispatchFile=join(root,'offline-native-dispatch.jsonl');const preload=join(root,'offline-native-fetch.mjs');await writeFile(preload,`import {appendFileSync} from 'node:fs';const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url);if(url.hostname==='127.0.0.1'||url.hostname==='localhost')return original(input,init);if(url.href!=='https://chatgpt.com/backend-api/codex/responses')throw Error('Offline fixture blocks external network');const body=JSON.parse(init.body);appendFileSync(${JSON.stringify(dispatchFile)},JSON.stringify({model:body.model,input:body.input,instructions:body.instructions,stream:body.stream,store:body.store,tools:body.tools})+'\\n');return new Response(${JSON.stringify(sse)},{headers:{'content-type':'text/event-stream'}});};`);return{preloadPaths:[preload]};
  }});
  const {sessionId}=await f.rpc('session/create',{request:{workspaceId:f.workspace.workspace.workspaceId,agentPreset:'standard'}});
  await f.rpc('session/selectModel',{request:{sessionId,provider:'codex',model:'gpt-6.1-sol'}});
  await f.rpc('session/prompt',{request:{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'OFFLINE_PUBLIC_NATIVE_PROBE'}],clientTimeZone:'UTC'}});
  await until(()=>observer.calls.find(call=>call.finished&&call.streamCompleted&&call.text===text),60000);
  assert.deepEqual(f.errors,[]);assert.equal(observer.calls[0].finishReason,'stop');assert.equal(observer.calls[0].usage.completion_tokens,8);
  const dispatches=(await readFile(dispatchFile,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.equal(dispatches.length,1);assert.equal(dispatches[0].model,'gpt-6.1-sol');assert.equal(dispatches[0].store,false);assert.equal(dispatches[0].stream,true);assert.ok(Array.isArray(dispatches[0].input));assert.equal(dispatches[0].messages,undefined);
  assert.equal(JSON.stringify([...files.values()]).includes('offline-access-only'),false);assert.equal(JSON.stringify([...files.values()]).includes('offline-account'),false);
});
