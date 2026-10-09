import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {once} from 'node:events';import {chromium} from 'playwright';import WebSocket from 'ws';
const repo=fileURLToPath(new URL('../../',import.meta.url));
export async function until(fn,ms=30000){const deadline=Date.now()+ms;while(Date.now()<deadline){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,70));}throw Error('Host fixture timed out');}
export async function hostFixture(t,{reply='完成。',plugin=true,extraPackages=process.env.IUI_TEST_OMD_PACKAGE?['file:'+process.env.IUI_TEST_OMD_PACKAGE]:[],pluginFirst=process.env.IUI_TEST_PLUGIN_LAST!=='1',artifacts=false}={}){
  const root=await realpath(await mkdtemp(join(tmpdir(),'iui-host-'))),home=join(root,'home'),cwd=join(root,'workspace');await mkdir(home);await mkdir(cwd);
  const cli=process.env.IUI_TEST_CLI??join(repo,'node_modules/@deepseek-ai/dsh/lib/bin.js'),env={...process.env,DSH_HOME:home};delete env.DSH_PERMISSION_MODE;
  let stop,child,log='',base,cookie,browser,page;const requests=[],errors=[];
  const provider=createServer(async(req,res)=>{let input='';for await(const b of req)input+=b;const payload=JSON.parse(input);requests.push(payload);res.writeHead(200,{'Content-Type':'text/event-stream'});
    const custom=typeof reply==='function'?await reply(payload):[{delta:{role:'assistant',content:payload.tools?.length?reply:'交互测试'},finish_reason:'stop'}];
    for await(const choice of custom[Symbol.asyncIterator]?custom:custom){res.write('data: '+JSON.stringify({id:'test',object:'chat.completion.chunk',model:'fixture',choices:[{index:0,...choice}]})+'\n\n');}
    res.end('data: [DONE]\n\n');
  });await new Promise(r=>provider.listen(0,'127.0.0.1',r));
  const settings={'locale':{preference:'zh'},'llm-pi-ai':{providers:{fixture:{api:'openai-completions',baseURL:`http://127.0.0.1:${provider.address().port}/v1`,apiKeyEnv:'IUI_FIXTURE',models:[{id:'fixture',name:'交互测试模型',contextWindow:1000000,maxTokens:16384,input:['text']}]}}},'agent-default-model':{provider:'fixture',model:'fixture'}};
  await writeFile(join(home,'settings.yaml'),JSON.stringify(settings));await writeFile(join(home,'.credentials.yaml'),JSON.stringify({version:1,refs:{IUI_FIXTURE:'local-test-only'}}),{mode:0o600});
  const cliRun=args=>execFileSync(process.execPath,[cli,...args],{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:12*1024*1024});
  t.after(async()=>{if(!t.passed&&page&&!page.isClosed()){t.diagnostic((await page.locator('body').innerText()).slice(0,4000));await page.screenshot({path:root+'/failure.png'});}await browser?.close();await stop?.();provider.closeAllConnections();await new Promise(r=>provider.close(r));if(errors.length)t.diagnostic(JSON.stringify(errors));if(!t.passed)t.diagnostic(log.slice(-8000).replace(/token=\S+/g,'token=[redacted]'));if(!artifacts)await rm(root,{recursive:true,force:true});});
  cliRun(['--profile','iui-test','--from-default-profile','web','--dump-config']);
  if(!pluginFirst)for(const spec of extraPackages)cliRun(['plugin','--profile','iui-test','add',spec]);
  let tar;
  if(plugin&&process.env.IUI_TEST_PACKAGE){tar=process.env.IUI_TEST_PACKAGE;cliRun(['plugin','--profile','iui-test','add','file:'+tar]);}
  else if(plugin){const [pack]=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',root],{cwd:repo,encoding:'utf8'}));tar=join(root,pack.filename);cliRun(['plugin','--profile','iui-test','add','file:'+tar]);}
  if(pluginFirst)for(const spec of extraPackages)cliRun(['plugin','--profile','iui-test','add',spec]);
  stop=async()=>{if(!child||child.exitCode!==null||child.signalCode!==null)return;child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,5000).unref())]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit');}};
  const boot=async()=>{log='';child=spawn(process.execPath,[cli,'--profile','iui-test','--no-open','--port','0'],{cwd,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const url=await until(()=>{if(child.exitCode!==null)throw Error(log.replace(/token=\S+/g,'token=[redacted]'));return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];},60000);base=new URL(url).origin;const login=await fetch(url,{redirect:'manual'});cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');return url;};
  const rpc=async(method,args)=>{const r=await fetch(`${base}/api/${method}`,{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args}})});const body=await r.json();if(!body.result?.ok)throw Error(JSON.stringify(body));return body.result.value;};
  const snapshot=async sessionId=>{const socket=new WebSocket(base.replace('http:','ws:')+'/api/remote.mux',{headers:{Cookie:cookie,Origin:base}});try{await once(socket,'open');const event=once(socket,'message');socket.send(JSON.stringify({type:'open',streamId:crypto.randomUUID(),endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId},maxMessages:100}}}}));const item=JSON.parse((await event)[0].toString());if(item.type!=='item')throw Error(JSON.stringify(item));return item.value;}finally{socket.close();}};
  const api=async(path,input)=>{const r=await fetch(base+'/intelligent-ui/api'+path,{headers:{cookie,...(input?{'Content-Type':'application/json'}:{})},...(input?{method:'POST',body:JSON.stringify(input)}:{})});const text=await r.text();return{status:r.status,body:text?JSON.parse(text):{}};};

  const url=await boot();const workspace=await rpc('workspace/create',{request:{path:cwd}});await until(async()=>{try{return(await rpc('llm/listProviders',{})).some(x=>x.id==='fixture');}catch{return false;}});
  browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});page=await browser.newPage({viewport:{width:1280,height:850}});page.on('pageerror',e=>errors.push(e.message));await page.goto(url);const welcome=page.getByRole('button',{name:/^继续$|开始使用|开始体验|Get started|Start using/});await welcome.waitFor({state:'visible',timeout:3000}).then(()=>welcome.click()).catch(()=>{});await page.locator('[data-iui-entrance]').first().waitFor({state:'attached',timeout:30000}).catch(e=>{if(plugin)throw e;});
  return {root,home,cwd,workspace,page,browser,requests,errors,rpc,snapshot,api,cliRun,stop,boot,get base(){return base;},tar};
}
