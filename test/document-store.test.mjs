import test from 'node:test';import assert from 'node:assert/strict';
import {DocumentStore} from '../src/client/document-store.mjs';
const source='root = Stack([Input("x","x","zero"),Input("y","y","zero")])';
async function ready(store){store.update(source,false);for(let i=0;i<50&&store.snapshot.status==='loading';i++)await new Promise(r=>setTimeout(r,1));assert.equal(store.snapshot.status,'saved');}
test('hydration is once per source and a late receipt cannot overwrite newer edits',async t=>{
  let release;const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async(_s,_b,input)=>input?await new Promise(r=>release=()=>r({revision:1,...input})):({revision:0,sourceRevision:'hash',state:{x:'persisted'}})});t.after(()=>store.dispose());await ready(store);assert.equal(store.state.x,'persisted');store.set('x','first');const saved=store.save();await new Promise(r=>setTimeout(r,1));store.set('x','newest');release();await saved;assert.equal(store.state.x,'newest');assert.ok(store.dirty.has('x'));store.update(source,false);assert.equal(store.state.x,'newest');
});
test('CAS conflict stays latched through edits and explicit resolution preserves remote untouched fields',async t=>{
  let remote={revision:0,sourceRevision:'hash',state:{x:'zero',y:'zero'}},writes=0;
  const read=async(_s,_b,input)=>{if(!input)return structuredClone(remote);writes++;if(input.expectedRevision!==remote.revision)throw Object.assign(new Error('conflict'),{status:409,record:structuredClone(remote)});remote={...input,revision:remote.revision+1};return structuredClone(remote);};
  const a=new DocumentStore('s','1:1:0:0',{read,hash:async()=> 'hash'}),b=new DocumentStore('s','1:1:0:0',{read,hash:async()=> 'hash'});t.after(()=>{a.dispose();b.dispose();});await ready(a);await ready(b);
  a.set('x','A edit');await a.save();b.set('y','B first');await b.save();assert.equal(b.snapshot.status,'conflict');const before=writes;b.set('y','B newest');await b.save();assert.equal(writes,before);assert.equal(b.snapshot.status,'conflict');assert.equal(remote.state.x,'A edit');await b.save({resolveConflict:true});assert.equal(remote.state.x,'A edit');assert.equal(remote.state.y,'B newest');assert.equal(b.state.x,'A edit');b.set('y','B2');await b.save();assert.equal(remote.state.x,'A edit');assert.equal(remote.state.y,'B2');
});
test('late hydration cannot cross a source epoch into a new streaming document',async t=>{
  let release;const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async()=>await new Promise(r=>release=r)});t.after(()=>store.dispose());store.update(source,false);await new Promise(r=>setTimeout(r,1));store.update('root = Input("x","x","new")',true);release({revision:7,sourceRevision:'hash',state:{x:'OLD_PERSISTED'}});await new Promise(r=>setTimeout(r,1));assert.equal(store.snapshot.streaming,true);assert.equal(store.snapshot.status,'streaming');assert.equal(store.sourceRevision,null);assert.notEqual(store.state.x,'OLD_PERSISTED');
});
test('local draft recovery respects its original CAS revision and keeps quota warnings visible',async t=>{
  const data=new Map(),old=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}});t.after(()=>{if(old)Object.defineProperty(globalThis,'sessionStorage',old);else delete globalThis.sessionStorage;});
  let remote={revision:0,sourceRevision:'hash',state:{x:'zero',y:'zero'}},offline=true,writes=0;
  const read=async(_s,_b,input)=>{if(!input)return structuredClone(remote);writes++;if(offline)throw Object.assign(new Error('offline'),{status:503});if(input.expectedRevision!==remote.revision)throw Object.assign(new Error('conflict'),{status:409,record:structuredClone(remote)});remote={...input,revision:remote.revision+1};return structuredClone(remote);};
  const a=new DocumentStore('s','1:1:0:0',{read,hash:async()=> 'hash'});await ready(a);a.set('x','UNSAVED_A');await a.save();a.dispose();remote={revision:1,sourceRevision:'hash',state:{x:'NEW_REMOTE_B',y:'zero'}};offline=false;
  const b=new DocumentStore('s','1:1:0:0',{read,hash:async()=> 'hash'});t.after(()=>b.dispose());b.update(source,false);await new Promise(r=>setTimeout(r,5));assert.equal(b.state.x,'UNSAVED_A');assert.equal(b.snapshot.status,'conflict');const before=writes;await b.save();assert.equal(writes,before);assert.equal(remote.state.x,'NEW_REMOTE_B');await b.save({resolveConflict:true});assert.equal(remote.state.x,'UNSAVED_A');
  globalThis.sessionStorage.setItem=()=>{throw new Error('quota');};b.set('y','new');assert.match(b.snapshot.error,/本地草稿/);
});
