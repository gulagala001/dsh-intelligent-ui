import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,lstat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,basename,isAbsolute} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {once} from 'node:events';import {chromium} from 'playwright';import WebSocket from 'ws';
import {decodeZstdJSONL} from './zstd-jsonl.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
export async function until(fn,ms=30000){const deadline=Date.now()+ms;while(Date.now()<deadline){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,70));}throw Error('Host fixture timed out');}
// Serialized into an isolated test-only plugin. This uses the public streaming
// waterfall, leaving the installed provider's adapter and authentication intact.
export function applyNativeModelObserver(ctx,config){
  const send=async event=>{const response=await fetch(config.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Native model observer unavailable');return response.json();};
  const pick=(value,fields)=>Object.fromEntries(fields.filter(field=>value?.[field]!==undefined).map(field=>[field,value[field]]));
  const message=value=>({...pick(value,['role','toolCallId','isError']),content:(value.content??[]).map(block=>pick(block,['type','text','id','name','arguments','toolName']))});
  const observedChunk=chunk=>{
    const result=pick(chunk,['type','index','blockType','text','id','name','argumentsDelta']);
    if(chunk.block)result.block=pick(chunk.block,['type','text','id','name','arguments']);
    if(chunk.usage)result.usage=pick(chunk.usage,['inputTokens','outputTokens','totalTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens']);
    if(chunk.reason)result.reason={kind:chunk.reason.kind,...(chunk.reason.failure?{failure:pick(chunk.reason.failure,['code','message','status'])}:{})};
    return result;
  };
  ctx.on('llm/stream',(options,next)=>(async function*(){
    if(options.purpose==='session-title'){
      await send({kind:'auxiliary',purpose:'session-title'});
      const text='交互测试';yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text};yield{type:'block-end',index:0,block:{type:'text',text}};yield{type:'usage',usage:{inputTokens:0,outputTokens:0,totalTokens:0}};yield{type:'finish',reason:{kind:'stop'}};return;
    }
    const start=await send({kind:'start',request:{...pick(options,['provider','model','reasoningEffort','maxTokens','purpose']),messages:(options.messages??[]).map(message),tools:(options.tools??[]).map(tool=>pick(tool,['name','description','parameters']))}});
    if(start.error)throw Error(start.error);
    let completed=false,error,iterator;
    try{
      iterator=next()[Symbol.asyncIterator]();
      while(true){
        let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native model stream deadline exceeded')),config.timeoutMs);});
        let item;try{item=await Promise.race([iterator.next(),timeout]);}finally{clearTimeout(timer);}
        if(item.done){completed=true;break;}
        const decision=await send({kind:'chunk',callId:start.callId,chunk:observedChunk(item.value)});
        if(decision.error)throw Error(decision.error);
        yield item.value;
      }
    }catch(cause){error=String(cause?.message??cause);throw cause;}
    finally{
      if(!completed)iterator?.return?.().catch(()=>{});
      await send({kind:'end',callId:start.callId,completed,...(error?{error}:{})});
    }
  })());
}
export async function hostFixture(t,{reply='完成。',plugin=true,extraPackages=process.env.IUI_TEST_OMD_PACKAGE?['file:'+process.env.IUI_TEST_OMD_PACKAGE]:[],pluginFirst=process.env.IUI_TEST_PLUGIN_LAST!=='1',artifacts=false,stateWriteFault=false,modelDefinition={},providerDefinition={},reasoningEffort,nativeModel,nativeSettings={},initializeHome,nativeObserver,redact=value=>String(value)}={}){
  const root=await realpath(await mkdtemp(join(tmpdir(),'iui-host-'))),home=join(root,'home'),cwd=join(root,'workspace');await mkdir(home);await mkdir(cwd);
  const cli=process.env.IUI_TEST_CLI??join(repo,'node_modules/@deepseek-ai/dsh/lib/bin.js'),env={...process.env,HOME:home,USERPROFILE:home,DSH_HOME:home};delete env.DSH_PERMISSION_MODE;
  let stop,child,tar,log='',base,cookie,browser,page,provider;const requests=[],errors=[],groups=[];
  const faultArm=join(root,'state-write.arm'),faultHits=join(root,'state-write-hits.jsonl'),preload=join(root,'state-write-preload.mjs');
  if(stateWriteFault)await writeFile(preload,`import fs from 'node:fs/promises';\nimport {syncBuiltinESMExports} from 'node:module';\nimport {resolve,relative,dirname,basename,isAbsolute,sep} from 'node:path';\nconst root=${JSON.stringify(root)},arm=${JSON.stringify(faultArm)},hits=${JSON.stringify(faultHits)},rename=fs.rename;let consumed=false;\nfs.rename=async function(from,to){const target=typeof to==='string'?to:'',within=relative(root,target);if(!consumed&&isAbsolute(target)&&resolve(target)===target&&within&&!isAbsolute(within)&&!within.split(sep).includes('..')&&basename(dirname(target))==='state'&&basename(dirname(dirname(target)))==='intelligent-ui'&&/^[a-f0-9]{64}\\.json$/.test(basename(target))&&await fs.realpath(dirname(target))===dirname(target)){try{await fs.unlink(arm);consumed=true;}catch(error){if(error.code!=='ENOENT')throw error;}if(consumed){await fs.appendFile(hits,JSON.stringify({target,temporary:from,code:'EIO',operation:'rename'})+'\\n',{mode:0o600});throw Object.assign(new Error('fixture state write EIO'),{code:'EIO'});}}return rename.call(this,from,to);};syncBuiltinESMExports();\n`,{mode:0o600});
  // POSIX hosts own a fresh process group; never inspect command lines or signal unrelated processes.
  const groupRows=pgid=>execFileSync('ps',['-axo','pid=,ppid=,pgid=,lstart='],{encoding:'utf8'}).trim().split('\n').map(line=>{const match=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);return match?{pid:Number(match[1]),ppid:Number(match[2]),pgid:Number(match[3]),start:match[4]}:null;}).filter(row=>row?.pgid===pgid);
  const sampleGroup=group=>{const rows=groupRows(group.pgid);if(rows.length&&!rows.some(row=>group.identities.get(row.pid)===row.start||!group.identities.size&&row.pid===group.pgid&&row.ppid===process.pid))throw Error('Fixture process group ownership cannot be verified');for(const row of rows){const prior=group.identities.get(row.pid);if(prior&&prior!==row.start)throw Error('Fixture process identity changed');group.identities.set(row.pid,row.start);}return rows;};
  const remainingGroups=()=>process.platform==='win32'?null:groups.flatMap(group=>groupRows(group.pgid));
  t.after(async()=>{
    const cleanupFailures=[];const clean=async(label,operation)=>{try{return await operation();}catch(error){cleanupFailures.push(redact(label+': '+error.message));}};
    if(!t.passed&&page&&!page.isClosed())await clean('failure screenshot',async()=>{t.diagnostic(redact(await page.locator('body').innerText()).slice(0,4000));await page.screenshot({path:root+'/failure.png'});});
    await clean('browser close',()=>browser?.close());await clean('host stop',()=>stop?.());
    for(const group of groups)clearInterval(group.timer);
    await clean('provider close',async()=>{if(!provider)return;provider.closeAllConnections();if(provider.listening)await new Promise(r=>provider.close(r));});
    const processTreeRemaining=await clean('process tree inspection',()=>remainingGroups());
    const redactedLog=redact(log.replace(/token=\S+/g,'token=[redacted]'));
    if(errors.length)t.diagnostic(redact(JSON.stringify(errors)));if(!t.passed)t.diagnostic(redactedLog.slice(-8000));
    if(!artifacts&&!processTreeRemaining?.length)await clean('fixture directory removal',()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200}));
    if(process.env.IUI_FIXTURE_EVIDENCE){
      const dir=process.env.IUI_FIXTURE_EVIDENCE;await mkdir(dir,{recursive:true,mode:0o700});
      const rootRemoved=await lstat(root).then(()=>false,error=>{if(error.code==='ENOENT')return true;throw error;});
      await writeFile(join(dir,basename(root)+'.host.log'),redactedLog,{mode:0o600});
      await writeFile(join(dir,basename(root)+'.cleanup.json'),JSON.stringify({test:t.name,root,cli,plugin,package:tar??null,hostStopped:!child||child.exitCode!==null||child.signalCode!==null,browserClosed:!browser||!browser.isConnected(),providerClosed:!provider?.listening,rootRemoved,retainedArtifacts:artifacts||!rootRemoved,processTreeChecked:process.platform!=='win32'&&processTreeRemaining!==undefined,processTreeRemaining,cleanupFailures,ownedGroups:groups.map(group=>({pgid:group.pgid,identities:[...group.identities]}))},null,2),{mode:0o600});
    }
    if(processTreeRemaining?.length)throw Error('Fixture host process group leaked');
    if(cleanupFailures.length)throw Error(cleanupFailures.join('; '));
  });
  provider=createServer(async(req,res)=>{try{let input='';for await(const b of req)input+=b;const payload=JSON.parse(input);
    if(req.url==='/native-observer'&&nativeObserver){const result=await nativeObserver.handle(payload);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result??{}));return;}
    if(nativeModel){res.writeHead(404);res.end();return;}
    requests.push(payload);res.writeHead(200,{'Content-Type':'text/event-stream'});
    const custom=typeof reply==='function'?await reply(payload):[{delta:{role:'assistant',content:payload.tools?.length?reply:'交互测试'},finish_reason:'stop'}];
    for await(const choice of custom[Symbol.asyncIterator]?custom:custom){const chunk=Array.isArray(choice.choices)?{...choice,model:'fixture'}:{id:'test',object:'chat.completion.chunk',model:'fixture',choices:[{index:0,...choice}]};res.write('data: '+JSON.stringify(chunk)+'\n\n');}
    res.end('data: [DONE]\n\n');
    }catch(error){errors.push(redact(error.message));if(!res.headersSent)res.writeHead(500);res.end();}
  });await new Promise(r=>provider.listen(0,'127.0.0.1',r));
  const fixtureSettings={'llm-pi-ai':{providers:{fixture:{...providerDefinition,api:'openai-completions',baseURL:`http://127.0.0.1:${provider.address().port}/v1`,apiKeyEnv:'IUI_FIXTURE',models:[{contextWindow:1000000,maxTokens:16384,input:['text'],...modelDefinition,id:'fixture',name:'交互测试模型'}]}}}};
  const settings={'locale':{preference:'zh'},...(nativeModel?{}:fixtureSettings),...nativeSettings,'agent-default-model':{...(nativeModel??{provider:'fixture',model:'fixture'}),...(reasoningEffort?{reasoningEffort}:{})}};
  await writeFile(join(home,'settings.yaml'),JSON.stringify(settings));await writeFile(join(home,'.credentials.yaml'),JSON.stringify({version:1,refs:{IUI_FIXTURE:'local-test-only'}}),{mode:0o600});
  const initialization=await initializeHome?.({root,home,cwd,nativeObserverEndpoint:`http://127.0.0.1:${provider.address().port}/native-observer`})??{},nativePreloads=initialization.preloadPaths??[];
  // Node's ESM loader requires file URLs for absolute Windows paths. Preserve
  // existing file:, data:, node: and package specifiers across every CLI entry.
  const preloadSpecifier=path=>isAbsolute(path)?pathToFileURL(path).href:path;
  const nativePreloadArgs=nativePreloads.flatMap(path=>['--import',preloadSpecifier(path)]);
  const nativePatch=Object.keys(nativeSettings).length?join(root,'native-settings.patch.yml'):null;
  if(nativePatch)await writeFile(nativePatch,JSON.stringify(Object.entries(nativeSettings).map(([id,config])=>({id,config}))));
  let observerPackage;
  if(nativeObserver){observerPackage=join(root,'native-observer');await mkdir(observerPackage);await writeFile(join(observerPackage,'package.json'),JSON.stringify({name:'iui-native-model-observer',version:'0.0.0',type:'module',main:'index.mjs',dsh:{bundle:{patch:['./cordis.patch.yml']}}}));await writeFile(join(observerPackage,'index.mjs'),`export const name='iui-native-model-observer';export const inject=['llm'];export const apply=${applyNativeModelObserver.toString()};\n`);await writeFile(join(observerPackage,'cordis.patch.yml'),JSON.stringify([{insert:[{id:'iui-native-model-observer',name:'iui-native-model-observer',config:{endpoint:`http://127.0.0.1:${provider.address().port}/native-observer`,timeoutMs:nativeObserver.timeoutMs??240000}}]}]));}
  const cliRun=args=>execFileSync(process.execPath,[...nativePreloadArgs,cli,...args],{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:12*1024*1024});
  cliRun(['--profile','iui-test','--from-default-profile','web','--dump-config']);
  if(!pluginFirst)for(const spec of extraPackages)cliRun(['plugin','--profile','iui-test','add',spec]);
  if(plugin&&process.env.IUI_TEST_PACKAGE){tar=process.env.IUI_TEST_PACKAGE;cliRun(['plugin','--profile','iui-test','add','file:'+tar]);}
  else if(plugin){const [pack]=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',root],{cwd:repo,encoding:'utf8'}));tar=join(root,pack.filename);cliRun(['plugin','--profile','iui-test','add','file:'+tar]);}
  if(pluginFirst)for(const spec of extraPackages)cliRun(['plugin','--profile','iui-test','add',spec]);
  if(observerPackage)cliRun(['plugin','--profile','iui-test','add','file:'+observerPackage]);
  stop=async()=>{const target=child;if(!target)return;const alive=()=>target.exitCode===null&&target.signalCode===null;if(process.platform==='win32'){if(!alive())return;const exited=once(target,'exit');try{execFileSync(join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(target.pid),'/T','/F'],{stdio:'ignore',timeout:15000,windowsHide:true});}catch(error){if(alive())throw error;}await exited;return;}const group=groups.find(item=>item.pgid===target.pid);if(!group)return;const signal=name=>{const rows=groupRows(group.pgid);if(!rows.length)return;for(const row of rows)if(group.identities.get(row.pid)!==row.start)throw Error('Unverified fixture process identity before cleanup');process.kill(-group.pgid,name);};sampleGroup(group);signal('SIGTERM');const deadline=Date.now()+5000;while(groupRows(group.pgid).length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,70));if(groupRows(group.pgid).length)signal('SIGKILL');await until(()=>groupRows(group.pgid).length===0,5000);clearInterval(group.timer);};
  const boot=async()=>{log='';child=spawn(process.execPath,[...nativePreloadArgs,...(stateWriteFault?['--import',preloadSpecifier(preload)]:[]),cli,'--profile','iui-test',...(nativePatch?['--patch',nativePatch]:[]),'--no-open','--port','0'],{cwd,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});if(process.platform!=='win32'){const group={pgid:child.pid,identities:new Map()};groups.push(group);sampleGroup(group);group.timer=setInterval(()=>{try{sampleGroup(group);}catch(error){errors.push(error.message);clearInterval(group.timer);}},200);group.timer.unref();}child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const url=await until(()=>{if(child.exitCode!==null)throw Error(redact(log.replace(/token=\S+/g,'token=[redacted]')));return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];},60000);base=new URL(url).origin;const login=await fetch(url,{redirect:'manual'});cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');return url;};
  const rpc=async(method,args)=>{const r=await fetch(`${base}/api/${method}`,{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args}})});const body=await r.json();if(!body.result?.ok)throw Error(JSON.stringify(body));return body.result.value;};
  const snapshot=async sessionId=>{const socket=new WebSocket(base.replace('http:','ws:')+'/api/remote.mux',{headers:{Cookie:cookie,Origin:base}});try{await once(socket,'open');const event=once(socket,'message');socket.send(JSON.stringify({type:'open',streamId:crypto.randomUUID(),endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId},maxMessages:100}}}}));const item=JSON.parse((await event)[0].toString());if(item.type!=='item')throw Error(JSON.stringify(item));return item.value;}finally{socket.close();}};
  const api=async(path,input)=>{const r=await fetch(base+'/intelligent-ui/api'+path,{headers:{cookie,...(input?{'Content-Type':'application/json'}:{})},...(input?{method:'POST',body:JSON.stringify(input)}:{})});const text=await r.text();return{status:r.status,body:text?JSON.parse(text):{}};};

  const url=await boot();const workspace=await rpc('workspace/create',{request:{path:cwd}});await until(async()=>{try{if(!(await rpc('llm/listProviders',{})).some(x=>x.id===(nativeModel?.provider??'fixture')))return false;return !nativeModel||(await rpc('session/modelCatalog',{})).groups.some(group=>group.id===nativeModel.provider&&group.models.some(model=>model.id===nativeModel.model));}catch{return false;}});
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});page=await browser.newPage({viewport:{width:1280,height:850}});page.on('pageerror',e=>errors.push(redact(e.message)));await page.goto(url);const welcome=page.getByRole('button',{name:/^继续$|开始使用|开始体验|Get started|Start using/});await welcome.waitFor({state:'visible',timeout:3000}).then(()=>welcome.click()).catch(()=>{});if(plugin)await page.locator('[data-iui-entrance]').first().waitFor({state:'attached',timeout:30000});
  const persistedSession=async sessionId=>{const files=[],candidates=[];const walk=async directory=>{for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory()&&!entry.isSymbolicLink())await walk(path);else if(entry.isFile()&&/\.jsonl(?:\.zstd)?$/.test(entry.name)){candidates.push(entry.name);if(basename(directory)===sessionId)files.push(path);}}};await walk(home);if(files.length!==1)throw Error(`Expected one fixture native persisted Session generation for sessionId=${JSON.stringify(sessionId)}; matched=${files.length}; candidate basenames=${JSON.stringify(candidates.sort())}`);const bytes=await readFile(files[0]),decoded=files[0].endsWith('.zstd')?decodeZstdJSONL(bytes):{text:bytes.toString(),frames:0};return{path:files[0],...decoded,rows:decoded.text.trim().split('\n').map(line=>JSON.parse(line))};};
  return {root,home,cwd,workspace,page,browser,requests,errors,rpc,snapshot,api,cliRun,stop,boot,persistedSession,armStateWriteFailure:()=>{if(!stateWriteFault)throw Error('Fixture state fault hook not enabled');return writeFile(faultArm,'one',{mode:0o600});},stateWriteFaults:async()=>{try{return(await readFile(faultHits,'utf8')).trim().split('\n').map(line=>JSON.parse(line));}catch(error){if(error.code==='ENOENT')return[];throw error;}},get base(){return base;},tar};
}
