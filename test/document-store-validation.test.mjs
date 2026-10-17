import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStore } from '../src/client/document-store.mjs';

async function fixture(t,state={},source='root = Text("ready")') {
  const store=new DocumentStore('validation-boundary','block',{hash:async()=> 'hash',read:async()=>({revision:1,sourceRevision:'hash',state:structuredClone(state)})});
  t.after(()=>store.dispose());store.update(source,false);
  for(let i=0;i<8&&store.snapshot.status==='loading';i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.snapshot.status,'saved');return store;
}
function rejectsUnchanged(store,run,code) {
  const state=store.state,snapshot=store.snapshot,dirty=[...store.dirty];
  assert.throws(run,error=>error.code===code);
  assert.equal(store.state,state);assert.equal(store.snapshot,snapshot);assert.deepEqual([...store.dirty],dirty);
}

test('state commits retain value and aggregate validation before publishing',async t=>{
  const store=await fixture(t,{keep:'draft'}),cycle={};cycle.self=cycle;
  for(const [value,code]of [[undefined,'INVALID_DATA'],[Infinity,'NON_FINITE'],[cycle,'INVALID_DATA'],[JSON.parse('{"constructor":1}'),'UNSAFE_KEY'],[{['k'.repeat(257)]:1},'STATE_KEY_LIMIT']]){
    rejectsUnchanged(store,()=>store.set('newValue',value),code);
    rejectsUnchanged(store,()=>store.action({type:'set',name:'newValue',value}),code);
    rejectsUnchanged(store,()=>store.setWidget('root.0',value),code);
  }
  const large=await fixture(t,{a:'x'.repeat(30000),b:'x'.repeat(30000),c:'x'.repeat(30000),d:'x'.repeat(30000)});
  rejectsUnchanged(large,()=>large.set('newValue','x'.repeat(20000)),'DATA_LIMIT');
  rejectsUnchanged(large,()=>large.action({type:'set',name:'newValue',value:'x'.repeat(20000)}),'DATA_LIMIT');
});

test('each commit revalidates existing state and selection reconciliation still clears stale rows',async t=>{
  const store=await fixture(t,{keep:{value:1}});store.state.keep.value=Infinity;
  rejectsUnchanged(store,()=>store.set('newValue',2),'NON_FINITE');store.state.keep.value=1;
  store.set('newValue',2);assert.equal(store.state.newValue,2);
  const table=await fixture(t,{records:[{id:'a',name:'A'},{id:'b',name:'B'}],picked:{selected:0,extra:'keep'}},'$records = []\nroot = Table(["id","name"],$records,"Records","picked")');
  table.set('records',[table.state.records[1],table.state.records[0]]);
  assert.equal(table.state.picked.selected,null);assert.equal(table.state.picked.selectedIdentity,null);assert.equal(table.state.picked.extra,'keep');
});
