import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {DocumentStore} from '../src/client/document-store.mjs';
const source='root = Input("x","x","zero")';
const sourceRevision=createHash('sha256').update(source).digest('hex');
const receipt=(state={x:'remote'},revision=1)=>({session:'synthetic',block:'0:0:0:0',source,sourceRevision,protocolVersion:1,componentsVersion:4,revision,state,persisted:true});
async function setup(t,handler) {
 const server=createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const nativeFetch=globalThis.fetch,url='http://127.0.0.1:'+server.address().port+'/';
 globalThis.fetch=(relative,options)=>nativeFetch(new URL(relative,url),options);
 t.after(async()=>{globalThis.fetch=nativeFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const store=new DocumentStore('synthetic','0:0:0:0');
 t.after(()=>store.dispose());return store;
}
function json(res,value,status=200){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));}
async function waitFor(store,status,timeout=7000) {
 const until=Date.now()+timeout;
 while(store.snapshot.status!==status&&Date.now()<until)await new Promise(r=>setTimeout(r,5));
 assert.equal(store.snapshot.status,status,store.snapshot.error);
}
test('empty HTTP 404 retries and hydrates the later persisted response',async t=>{
 let reads=0;
 const store=await setup(t,(_req,res)=>{if(++reads===1){res.writeHead(404);res.end();}else json(res,receipt());});
 store.update(source,false);await waitFor(store,'saved');
 assert.equal(reads,2);assert.equal(store.state.x,'remote');
});
test('permanent empty HTTP 404 retries only within the existing bound and gives a startup action',async t=>{
 let reads=0;
 const store=await setup(t,(_req,res)=>{reads++;res.writeHead(404);res.end();});
 store.update(source,false);await waitFor(store,'load-error');
 assert.equal(reads,8);assert.match(store.snapshot.error,/检查插件是否成功启动/);
 await new Promise(r=>setTimeout(r,200));assert.equal(reads,8);
});
test('empty 401 is an authentication error and does not retry as missing state',async t=>{
 let reads=0;
 const store=await setup(t,(_req,res)=>{reads++;res.writeHead(401);res.end();});
 store.update(source,false);await waitFor(store,'load-error');
 assert.match(store.snapshot.error,/登录/);await new Promise(r=>setTimeout(r,200));assert.equal(reads,1);
});
test('HTML 500 during save retains edits and reports the HTTP status',async t=>{
 let posts=0;
 const store=await setup(t,(req,res)=>{if(req.method==='POST'){posts++;res.writeHead(500,{'content-type':'text/html'});res.end('<h1>fixture failure</h1>');}else json(res,receipt());});
 store.update(source,false);await waitFor(store,'saved');store.set('x','不可丢失的编辑');await store.save();
 assert.equal(store.snapshot.status,'save-error');assert.match(store.snapshot.error,/HTTP 500/);
 assert.equal(store.state.x,'不可丢失的编辑');assert.ok(store.dirty.has('x'));assert.equal(posts,1);
});
test('JSON 409 preserves the real conflict record and the local draft',async t=>{
 const remote=receipt({x:'other writer'},2);
 const store=await setup(t,(req,res)=>req.method==='POST'?json(res,{error:'CAS conflict',record:remote},409):json(res,receipt()));
 store.update(source,false);await waitFor(store,'saved');store.set('x','local draft');await store.save();
 assert.equal(store.snapshot.status,'conflict');assert.equal(store.state.x,'local draft');
 assert.equal(store.conflictRecord.revision,2);assert.ok(store.dirty.has('x'));
});
test('empty 409 triggers a read before another write instead of dropping the status',async t=>{
 let posts=0,reads=0;
 const store=await setup(t,(req,res)=>{
  if(req.method==='POST'){posts++;res.writeHead(409);res.end();}
  else {reads++;json(res,receipt({x:reads===1?'initial':'other writer'},reads===1?1:2));}
 });
 store.update(source,false);await waitFor(store,'saved');store.set('x','local draft');await store.save();
 assert.equal(store.snapshot.status,'save-error');assert.equal(store.reloadBeforeSave,true);
 await store.save();assert.equal(reads,2);assert.equal(posts,1);
 assert.equal(store.snapshot.status,'conflict');assert.equal(store.state.x,'local draft');
});
test('aborting a response body on source retirement cannot retry or publish a late error',async t=>{
 let reads=0;
 const store=await setup(t,(_req,res)=>{
  reads++;res.writeHead(404,{'content-type':'application/json'});res.write('{');
 });
 store.update(source,false);
 while(reads===0)await new Promise(r=>setTimeout(r,5));
 store.update('root = Input("x","x","new")',true);
 await new Promise(r=>setTimeout(r,250));
 assert.equal(reads,1);assert.equal(store.snapshot.status,'streaming');assert.equal(store.snapshot.error,'');
});
for(const [label,body] of [['empty',''],['HTML','<h1>not a receipt</h1>'],['null','null']]) {
 test('HTTP 200 '+label+' cannot acknowledge an unsaved edit',async t=>{
  const store=await setup(t,(req,res)=>{if(req.method==='POST'){res.writeHead(200);res.end(body);}else json(res,receipt());});
  store.update(source,false);await waitFor(store,'saved');store.set('x','必须保留');await store.save();
  assert.equal(store.snapshot.status,'save-error');assert.match(store.snapshot.error,/无效/);
  assert.equal(store.revision,1);assert.equal(store.state.x,'必须保留');assert.ok(store.dirty.has('x'));
 });
}
