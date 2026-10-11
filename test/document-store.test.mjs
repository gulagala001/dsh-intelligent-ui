import test from 'node:test';import assert from 'node:assert/strict';
import {DocumentStore} from '../src/client/document-store.mjs';
import {componentsVersion} from '../src/protocol/version.mjs';
import {catalog} from '../src/catalog.mjs';
const source='root = Stack([Input("x","x","zero"),Input("y","y","zero")])';
async function ready(store){store.update(source,false);for(let i=0;i<50&&store.snapshot.status==='loading';i++)await new Promise(r=>setTimeout(r,1));assert.equal(store.snapshot.status,'saved');}
async function hydrated(store){for(let i=0;i<50&&store.snapshot.status==='loading';i++)await new Promise(r=>setTimeout(r,1));assert.notEqual(store.snapshot.status,'loading');}
function storageFor(t,value){const old=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value});t.after(()=>{if(old)Object.defineProperty(globalThis,'sessionStorage',old);else delete globalThis.sessionStorage;});}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
test('implicit widget state persists by component path without becoming an explicit model binding',async t=>{
  let remote={revision:0,sourceRevision:'hash',state:{x:'zero',y:'zero'}};
  const read=async(_s,_b,input)=>{if(!input)return structuredClone(remote);remote={...input,revision:remote.revision+1};return structuredClone(remote);};
  const a=new DocumentStore('s','1:1:0:0',{read,hash:async()=> 'hash'});t.after(()=>a.dispose());await ready(a);
  a.setWidget('root.0.0',{hidden:['b'],selected:1});a.setWidget('root.0.1',{sort:'value',direction:'desc'});
  assert.deepEqual(a.widget('root.0.0',{}),{hidden:['b'],selected:1});assert.equal(a.state.x,'zero');
  assert.throws(()=>a.set('@iui-widget:root.0.0',{}),/无效变量/);
  assert.throws(()=>a.setWidget('../outside',{}),/组件路径/);
  await a.save();
  const b=new DocumentStore('s','1:1:0:0',{read,hash:async()=> 'hash'});t.after(()=>b.dispose());await ready(b);
  assert.deepEqual(b.widget('root.0.0',{}),{hidden:['b'],selected:1});assert.deepEqual(b.widget('root.0.1',{}),{sort:'value',direction:'desc'});assert.deepEqual(b.widget('root.0.2',{selected:null}),{selected:null});
  b.setWidget('root.items.field["中文/键"]',{selected:1});assert.deepEqual(b.widget('root.items.field["中文/键"]',{}),{selected:1});
});
test('callbacks from a retired source cannot edit a newer document',async t=>{
  const store=new DocumentStore('s','1:1:0:0',{read:async()=>({revision:0,sourceRevision:'hash',state:{}}),hash:async()=> 'hash'});t.after(()=>store.dispose());await ready(store);
  const old=store.api();store.update('root = Input("x","x","new")',false);await new Promise(r=>setTimeout(r,1));
  assert.throws(()=>old.set('x','OLD'),/作品内容已变化/);assert.throws(()=>old.setWidget('root',{selected:1}),/作品内容已变化/);assert.throws(()=>old.action({type:'set',name:'x',value:'OLD'}),/作品内容已变化/);assert.notEqual(store.state.x,'OLD');
});
test('source retirement cancels the old gesture before retiring its API',async t=>{
  const store=new DocumentStore('s','1:1:0:0',{read:async()=>({revision:0,sourceRevision:'hash',state:{}}),hash:async()=> 'hash'});t.after(()=>store.dispose());await ready(store);
  const old=store.api(),player=store.playback.get('drag'),owner=Symbol();let cancelled=0;
  assert.equal(player.claimGesture(owner,()=>{cancelled++;old.set('x','CANCELLED');}),true);
  store.update('root = Input("x","x","new")',false);
  assert.equal(cancelled,1);assert.equal(player.gesture,null);assert.equal(player.disposed,true);
  assert.throws(()=>old.set('x','LATE'),/作品内容已变化/);assert.equal(store.state.x,'new');assert.equal(store.dirty.size,0);
});
test('source changes isolate dirty fields and retries of the same source retain them',async t=>{
  const records=new Map([['old',{revision:1,sourceRevision:'old',state:{x:'old-remote'}}],['new',{revision:1,sourceRevision:'new',state:{x:'new-remote'}}]]);
  const store=new DocumentStore('s','1:1:0:0',{hash:async text=>text.includes('new')?'new':'old',read:async()=>structuredClone(records.get(store.snapshot.source.includes('new')?'new':'old'))});t.after(()=>store.dispose());
  await ready(store);store.set('x','OLD-DIRTY');store.update('root = Input("x","x","new")',false);await new Promise(r=>setTimeout(r,5));
  assert.equal(store.state.x,'new-remote');assert.equal(store.dirty.size,0);
  store.set('x','NEW-DIRTY');store.update(store.snapshot.source,false,{reload:true});await new Promise(r=>setTimeout(r,5));assert.equal(store.state.x,'NEW-DIRTY');assert.ok(store.dirty.has('x'));
});
test('failed outgoing draft backup retains an exportable old snapshot without changing the new source',async t=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem(){}}});t.after(()=>{if(old)Object.defineProperty(globalThis,'sessionStorage',old);else delete globalThis.sessionStorage;});
  const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async()=>({revision:0,sourceRevision:'hash',state:{}})});t.after(()=>store.dispose());await ready(store);store.set('x','IMPORTANT-OLD-EDIT');
  store.update('root = Input("x","x","new")',false);await new Promise(r=>setTimeout(r,5));
  assert.equal(store.state.x,'new');assert.equal(store.dirty.size,0);assert.equal(store.snapshot.previousDraft.source,source);assert.equal(store.snapshot.previousDraft.state.x,'IMPORTANT-OLD-EDIT');assert.match(store.snapshot.error,/导出旧草稿/);
  store.set('x','IMPORTANT-NEW-EDIT');store.update(source,false);await new Promise(r=>setTimeout(r,5));assert.equal(store.state.x,'IMPORTANT-OLD-EDIT');assert.ok(store.dirty.has('x'));assert.equal(store.snapshot.previousDraft.state.x,'IMPORTANT-NEW-EDIT');
  store.update('root = Input("x","x","new")',false);await new Promise(r=>setTimeout(r,5));assert.equal(store.state.x,'IMPORTANT-NEW-EDIT');assert.equal(store.snapshot.previousDraft.state.x,'IMPORTANT-OLD-EDIT');
});
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
for(const legacyVersion of [1,2,3]){
  test(`failed same-source reload retains hydrated components version ${legacyVersion} and local edits`,async t=>{
    let offline=false;
    const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async()=>{
      if(offline)throw Object.assign(new Error('offline'),{status:503});
      return {revision:7,sourceRevision:'hash',componentsVersion:legacyVersion,state:{x:'legacy-remote',y:'legacy-untouched'}};
    }});t.after(()=>store.dispose());await ready(store);
    assert.equal(store.snapshot.componentsVersion,legacyVersion);store.set('x','LOCAL-EDIT');offline=true;
    store.update(source,false,{reload:true});await hydrated(store);
    assert.equal(store.snapshot.status,'load-error');assert.equal(store.snapshot.componentsVersion,legacyVersion);
    assert.deepEqual(store.state,{x:'LOCAL-EDIT',y:'legacy-untouched'});assert.ok(store.dirty.has('x'));assert.equal(store.revision,7);
  });
  test(`quota fallback restores components version ${legacyVersion} when returning source cannot load`,async t=>{
    const old=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
    Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem(){}}});
    t.after(()=>{if(old)Object.defineProperty(globalThis,'sessionStorage',old);else delete globalThis.sessionStorage;});
    let oldOffline=false;const nextSource='root = Input("x","x","new")';
    const store=new DocumentStore('s','1:1:0:0',{hash:async text=>text===source?'old':'new',read:async()=>{
      if(store.snapshot.source===source){if(oldOffline)throw Object.assign(new Error('offline'),{status:503});return {revision:7,sourceRevision:'old',componentsVersion:legacyVersion,state:{x:'legacy-remote',y:'legacy-untouched'}};}
      return {revision:11,sourceRevision:'new',componentsVersion,state:{x:'new-remote'}};
    }});t.after(()=>store.dispose());await ready(store);store.set('x','OLD-LOCAL-EDIT');
    store.update(nextSource,false);await hydrated(store);assert.equal(store.snapshot.status,'saved');
    assert.equal(store.snapshot.previousDraft.componentsVersion,legacyVersion);store.set('x','NEW-LOCAL-EDIT');oldOffline=true;
    store.update(source,false);await hydrated(store);
    assert.equal(store.snapshot.status,'load-error');assert.equal(store.snapshot.componentsVersion,legacyVersion);
    assert.deepEqual(store.state,{x:'OLD-LOCAL-EDIT',y:'legacy-untouched'});assert.ok(store.dirty.has('x'));assert.equal(store.revision,7);
    assert.equal(store.snapshot.previousDraft.source,nextSource);assert.equal(store.snapshot.previousDraft.state.x,'NEW-LOCAL-EDIT');assert.equal(store.snapshot.previousDraft.componentsVersion,componentsVersion);
  });
}
test('save receipt publishes its new components version after hydrating a legacy document',async t=>{
  const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async(_s,_b,input)=>input?{...input,revision:8,componentsVersion,state:{...input.state,y:'receipt-untouched'}}:{revision:7,sourceRevision:'hash',componentsVersion:1,state:{x:'legacy-remote',y:'legacy-untouched'}}});
  t.after(()=>store.dispose());await ready(store);assert.equal(store.snapshot.componentsVersion,1);store.set('x','LOCAL-EDIT');await store.save();
  assert.equal(store.snapshot.status,'saved');assert.equal(store.snapshot.componentsVersion,componentsVersion);assert.equal(store.revision,8);assert.equal(store.dirty.size,0);
  assert.deepEqual(store.snapshot.state,{x:'LOCAL-EDIT',y:'receipt-untouched'});
});
test('409 from a different source cannot become a same-source merge or adopt its revision',async t=>{
  const writes=[];
  const foreign={revision:99,sourceRevision:'foreign-hash',componentsVersion,state:{x:'FOREIGN-X',y:'FOREIGN-Y',foreign:'MUST-NOT-IMPORT'}};
  const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async(_s,_b,input)=>{
    if(!input)return {revision:7,sourceRevision:'hash',componentsVersion:1,state:{x:'legacy-remote',y:'legacy-untouched'}};
    writes.push(structuredClone(input));
    if(writes.length===1)throw Object.assign(new Error('source changed'),{status:409,record:foreign});
    return {...input,revision:8,componentsVersion};
  }});t.after(()=>store.dispose());await ready(store);store.set('x','LOCAL-EDIT');await store.save();
  assert.equal(store.snapshot.status,'save-error');assert.equal(store.conflictRecord,null);assert.equal(store.revision,7);assert.equal(store.snapshot.componentsVersion,1);
  assert.deepEqual(store.state,{x:'LOCAL-EDIT',y:'legacy-untouched'});assert.ok(store.dirty.has('x'));
  await store.save({resolveConflict:true});assert.equal(writes.length,2);assert.equal(writes[1].expectedRevision,7);assert.equal(writes[1].sourceRevision,'hash');
  assert.deepEqual(writes[1].state,{x:'LOCAL-EDIT',y:'legacy-untouched'});assert.equal(store.snapshot.status,'saved');
});
test('unpersisted source projection uses defaults without importing an old journal or saving until edited',async t=>{
  const data=new Map([['dsh-iui.draft.v1:s:1:1:0:0',JSON.stringify({source:'root = Input("x","x","old")',state:{x:'OLD-DRAFT',y:'OLD-Y'},dirty:['x','y'],revision:99,conflict:true})]]);
  storageFor(t,{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});
  const writes=[];const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async(_s,_b,input)=>{
    if(!input)return {revision:7,sourceRevision:'hash',componentsVersion,persisted:false,state:{}};
    writes.push(structuredClone(input));return {...input,revision:8,componentsVersion,persisted:true};
  }});t.after(()=>store.dispose());store.update(source,false);await hydrated(store);
  assert.equal(store.snapshot.status,'default');assert.deepEqual(store.state,{x:'zero',y:'zero'});assert.equal(store.dirty.size,0);assert.equal(store.conflictRecord,null);
  assert.equal(store.snapshot.componentsVersion,componentsVersion);assert.equal(store.sourceRevision,'hash');assert.equal(store.revision,7);assert.equal(store.timer,undefined);
  await store.save();assert.equal(writes.length,0);
  store.set('x','NEW-EDIT');await store.save();assert.equal(writes.length,1);assert.equal(writes[0].expectedRevision,7);
  assert.deepEqual(writes[0].state,{x:'NEW-EDIT',y:'zero'});assert.equal(store.snapshot.status,'saved');assert.equal(store.dirty.size,0);
});
for(const receiptKind of ['foreign','missing'])for(const changedAgain of [false,true]){
  test(`resolved conflict with ${receiptKind} 409 reloads CAS before retry${changedAgain?' and requires confirmation of new remote edits':''}`,async t=>{
    storageFor(t,undefined);const writes=[];let reads=0;
    const remote={revision:8,sourceRevision:'hash',componentsVersion:1,state:{x:'REMOTE-X',y:'REMOTE-1'}};
    const foreign={revision:99,sourceRevision:'foreign-hash',componentsVersion,state:{x:'FOREIGN-X',y:'FOREIGN-Y'}};
    const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async(_s,_b,input)=>{
      if(!input){reads++;return reads===1?{revision:7,sourceRevision:'hash',componentsVersion:1,state:{x:'zero',y:'zero'}}:{...remote,revision:changedAgain?9:8,state:{...remote.state,y:changedAgain?'REMOTE-2':'REMOTE-1'}};}
      writes.push(structuredClone(input));
      if(writes.length===1)throw Object.assign(new Error('same source conflict'),{status:409,record:structuredClone(remote)});
      if(writes.length===2)throw Object.assign(new Error('source replaced'),{status:409,...(receiptKind==='foreign'?{record:foreign}:{})});
      return {...input,revision:input.expectedRevision+1,componentsVersion};
    }});t.after(()=>store.dispose());await ready(store);store.set('x','LOCAL-EDIT');await store.save();
    assert.equal(store.snapshot.status,'conflict');assert.equal(store.revision,8);
    await store.save({resolveConflict:true});assert.equal(store.snapshot.status,'save-error');assert.equal(store.conflictRecord,null);assert.equal(store.revision,8);
    assert.deepEqual(store.state,{x:'LOCAL-EDIT',y:'zero'});assert.ok(store.dirty.has('x'));assert.equal(writes.length,2);
    await store.save();assert.equal(reads,2);
    if(changedAgain){
      assert.equal(writes.length,2);assert.equal(store.snapshot.status,'conflict');assert.equal(store.revision,9);assert.ok(store.dirty.has('x'));
      await store.save();assert.equal(writes.length,2);await store.save({resolveConflict:true});
    }
    assert.equal(writes.length,3);assert.equal(writes[2].expectedRevision,changedAgain?9:8);assert.equal(writes[2].sourceRevision,'hash');
    assert.deepEqual(writes[2].state,{x:'LOCAL-EDIT',y:changedAgain?'REMOTE-2':'REMOTE-1'});assert.equal(store.snapshot.status,'saved');assert.equal(store.dirty.size,0);
  });
}
for(const outcome of ['success','failure']){
  test(`retired source save ${outcome} cannot overwrite a new source or clear its pending save`,async t=>{
    storageFor(t,undefined);const pendingA=deferred(),pendingB=deferred(),writes=[];const nextSource='root = Input("x","x","new")';
    const store=new DocumentStore('s','1:1:0:0',{hash:async text=>text===source?'old':'new',read:async(_s,_b,input,signal)=>{
      if(!input)return store.snapshot.source===source?{revision:7,sourceRevision:'old',componentsVersion:1,state:{x:'OLD',y:'OLD-Y'}}:{revision:20,sourceRevision:'new',componentsVersion,state:{x:'NEW'}};
      writes.push({input:structuredClone(input),signal});return input.source===source?pendingA.promise:pendingB.promise;
    }});t.after(()=>{pendingA.resolve({revision:8,sourceRevision:'old',state:{}});pendingB.resolve({revision:21,sourceRevision:'new',state:{}});store.dispose();});
    await ready(store);store.set('x','OLD-EDIT');const saveA=store.save();assert.equal(writes.length,1);assert.equal(writes[0].signal.aborted,false);
    store.update(nextSource,false);await hydrated(store);assert.equal(writes[0].signal.aborted,true);assert.equal(store.snapshot.status,'saved');
    store.set('x','NEW-EDIT');const saveB=store.save();assert.equal(writes.length,2);const writingB=store.writing;assert.ok(writingB);
    if(outcome==='success')pendingA.resolve({revision:88,sourceRevision:'old',componentsVersion:1,state:{x:'LATE-OLD',y:'LATE-Y'}});
    else pendingA.reject(Object.assign(new Error('late old conflict'),{status:409,record:{revision:88,sourceRevision:'old',componentsVersion:1,state:{x:'LATE-OLD'}}}));
    await saveA;assert.equal(store.writing,writingB);assert.equal(store.snapshot.status,'saving');assert.equal(store.snapshot.source,nextSource);
    assert.equal(store.snapshot.componentsVersion,componentsVersion);assert.equal(store.revision,20);assert.deepEqual(store.state,{x:'NEW-EDIT'});assert.ok(store.dirty.has('x'));assert.equal(store.conflictRecord,null);
    await store.save();assert.equal(writes.length,2);
    pendingB.resolve({...writes[1].input,revision:21,componentsVersion});await saveB;
    assert.equal(store.snapshot.status,'saved');assert.equal(store.revision,21);assert.deepEqual(store.state,{x:'NEW-EDIT'});assert.equal(store.dirty.size,0);assert.equal(store.writing,null);
  });
}
test('retry after a confirmed conflict does not relatch an unchanged remote from its older journal revision',async t=>{
  const data=new Map();storageFor(t,{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)});let reads=0;const writes=[];
  const remote={revision:8,sourceRevision:'hash',componentsVersion:1,state:{x:'REMOTE-X',y:'REMOTE-Y'}};
  const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async(_s,_b,input)=>{
    if(!input){reads++;return reads===1?{revision:7,sourceRevision:'hash',componentsVersion:1,state:{x:'zero',y:'zero'}}:structuredClone(remote);}
    writes.push(structuredClone(input));
    if(writes.length===1)throw Object.assign(new Error('same source conflict'),{status:409,record:structuredClone(remote)});
    if(writes.length===2)throw Object.assign(new Error('source replaced'),{status:409});
    return {...input,revision:9,componentsVersion};
  }});t.after(()=>store.dispose());await ready(store);store.set('x','LOCAL-EDIT');await store.save();await store.save({resolveConflict:true});
  assert.equal(store.snapshot.status,'save-error');assert.equal(store.conflictRecord,null);assert.equal(store.revision,8);await store.save();
  assert.equal(reads,2);assert.equal(writes.length,3);assert.equal(writes[2].expectedRevision,8);assert.deepEqual(writes[2].state,{x:'LOCAL-EDIT',y:'REMOTE-Y'});assert.equal(store.snapshot.status,'saved');assert.equal(store.dirty.size,0);
});
test('delayed recovery GET owns the write slot and saves the latest edits without revision rollback',async t=>{
  storageFor(t,undefined);const recovery=deferred(),writes=[];let reads=0,recoverySignal;
  const oldSnapshot={revision:7,sourceRevision:'hash',componentsVersion:1,state:{x:'zero',y:'zero'}};
  const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async(_s,_b,input,signal)=>{
    if(!input){reads++;if(reads===1)return structuredClone(oldSnapshot);recoverySignal=signal;return recovery.promise;}
    writes.push({input:structuredClone(input),signal});
    if(writes.length===1)throw Object.assign(new Error('source replaced'),{status:409});
    return {...input,revision:8,componentsVersion};
  }});t.after(()=>{recovery.resolve(structuredClone(oldSnapshot));store.dispose();});
  await ready(store);store.set('x','FIRST-EDIT');await store.save();assert.equal(store.snapshot.status,'save-error');assert.equal(writes.length,1);
  const retry1=store.save(),writing=store.writing;assert.equal(reads,2);assert.ok(writing);
  await store.save();assert.equal(reads,2);assert.equal(writes.length,1);assert.equal(store.writing,writing);
  store.set('x','LATEST-X');store.set('y','LATEST-Y');await store.save();
  assert.equal(reads,2);assert.equal(writes.length,1);assert.equal(store.revision,7);assert.deepEqual(store.state,{x:'LATEST-X',y:'LATEST-Y'});assert.equal(store.writing,writing);
  recovery.resolve(structuredClone(oldSnapshot));await retry1;
  assert.equal(writes.length,2);assert.equal(writes[1].signal,recoverySignal);assert.equal(writes[1].input.expectedRevision,7);
  assert.deepEqual(writes[1].input.state,{x:'LATEST-X',y:'LATEST-Y'});assert.equal(store.revision,8);assert.equal(store.snapshot.status,'saved');assert.equal(store.dirty.size,0);assert.equal(store.writing,null);
  await store.save();assert.equal(writes.length,2);assert.equal(store.revision,8);
});
test('changed-source compile failure uses the current components version rather than the retired version',async t=>{
  const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async()=>({revision:7,sourceRevision:'hash',componentsVersion:1,state:{x:'OLD'}})});t.after(()=>store.dispose());await ready(store);
  store.update('root = [',false);assert.equal(store.snapshot.status,'invalid');assert.equal(store.snapshot.tree,null);assert.equal(store.snapshot.componentsVersion,componentsVersion);assert.equal(store.dirty.size,0);
});
test('same-source validation failure retains its known components version',async t=>{
  const store=new DocumentStore('s','1:1:0:0',{hash:async()=> 'hash',read:async()=>({revision:7,sourceRevision:'hash',componentsVersion:2,state:{x:'OLD'}})});t.after(()=>store.dispose());await ready(store);
  t.mock.method(catalog.Input.schema,'safeParse',()=>{throw new Error('controlled component validation failure');});
  store.update(source,false,{reload:true});assert.equal(store.snapshot.status,'invalid');assert.equal(store.snapshot.tree,null);assert.equal(store.snapshot.componentsVersion,2);assert.equal(store.state.x,'OLD');
});
