import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentStore } from '../src/client/document-store.mjs';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const original=[{id:'a',name:'甲'},{id:'b',name:'乙'},{id:'c',name:'丙'}];
const reordered=[original[2],original[0],original[1]];
const picked={selected:0,sort:'name',direction:'desc',privateExtra:{text:'PRESERVE',values:[0,false,'']}};
const sourceFor=(rows=original,extra='')=>'$records = '+JSON.stringify(rows)+'\nroot = Stack([Table(["id","name"],$records,"记录","picked")'+extra+'])';
const submit={type:'submit',text:'执行所选',fields:['records','picked']};
const set=(name,value)=>({type:'set',name,value});
const reset=name=>({type:'reset',name});
const parsePayload=text=>JSON.parse(text.slice(text.indexOf('\n{')+1));
const selectedRecord=state=>state.picked?.selected==null?null:state.records[state.picked.selected];
async function fixture(t,{rows=original,selection=picked,source=sourceFor(rows)}={}){
 const old={records:structuredClone(rows),picked:structuredClone(selection),unrelated:{legacy:['keep',false,0]}};
 const store=new DocumentStore('table-transaction','1:1:0:0',{hash:async()=> 'hash',read:async(_s,_b,input)=>input?{...input,revision:1}:{revision:0,sourceRevision:'hash',componentsVersion:2,state:structuredClone(old)}});
 t.after(()=>store.dispose());store.update(source,false);
 for(let i=0;i<100&&store.snapshot.status==='loading';i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(store.snapshot.status,'saved');assert.deepEqual(store.state.picked,selection,'hydration retains original legacy values');
 return store;
}
const cleared=state=>{assert.equal(state.picked.selected,null);assert.equal(state.picked.selectedIdentity,null);assert.equal(state.picked.selectedTransient,null);assert.deepEqual(state.picked.privateExtra,picked.privateExtra);};

// No React/layout effect participates: the transaction itself must be safe at
// callback time, including when the caller has never mounted a Table view.
test('atomic reorder before submit clears public selected in the payload and synchronous callback state',async t=>{
 const store=await fixture(t),payloads=[],callbackStates=[];
 store.action([set('records',reordered),submit],text=>{payloads.push(parsePayload(text));callbackStates.push(structuredClone(store.state));});
 assert.equal(payloads.length,1);assert.deepEqual(payloads[0].records,reordered);cleared(payloads[0]);cleared(callbackStates[0]);cleared(store.state);
 assert.equal(selectedRecord(payloads[0]),null);assert.deepEqual(store.state.unrelated,{legacy:['keep',false,0]});
});

test('setValue clears before returning without requiring a submit or mounted UI',async t=>{
 const store=await fixture(t);store.set('records',reordered);cleared(store.state);assert.equal(selectedRecord(store.state),null);
});

test('submit before a later reorder preserves its valid point-in-sequence snapshot while final state clears',async t=>{
 const store=await fixture(t),payloads=[];store.action([submit,set('records',reordered)],text=>payloads.push(parsePayload(text)));
 assert.deepEqual(payloads[0].records,original);assert.deepEqual(payloads[0].picked,picked);assert.equal(selectedRecord(payloads[0]).id,'a');cleared(store.state);
});

for(const actions of [[set('records',reordered),set('picked',{...picked,selected:1}),submit],[set('picked',{...picked,selected:1}),set('records',reordered),submit]])test('explicit numeric selection uses the final transaction projection: '+actions.map(a=>a.type+':'+(a.name||'submit')).join(' '),async t=>{
 const store=await fixture(t),payloads=[];store.action(actions,text=>payloads.push(parsePayload(text)));
 assert.equal(payloads[0].picked.selected,1);assert.equal(selectedRecord(payloads[0]).id,'a');assert.equal(selectedRecord(store.state).id,'a');assert.deepEqual(payloads[0].picked.privateExtra,picked.privateExtra);
});

test('reset records reconciles existing selection and reset picked uses its authored/default sentinel',async t=>{
 const store=await fixture(t,{rows:reordered,source:sourceFor(original)}),payloads=[];
 store.action([reset('records'),submit],text=>payloads.push(parsePayload(text)));assert.deepEqual(payloads[0].records,original);cleared(payloads[0]);cleared(store.state);
 const second=await fixture(t),resetPayloads=[];second.action([reset('picked'),submit],text=>resetPayloads.push(parsePayload(text)));
 assert.deepEqual(resetPayloads[0].picked,{sort:null,direction:'asc',selected:null});assert.equal(selectedRecord(resetPayloads[0]),null);
});

test('multiple row updates never submit a different record under a stale index',async t=>{
 const store=await fixture(t),payloads=[];
 store.action([set('records',reordered),set('records',original),submit],text=>payloads.push(parsePayload(text)));
 assert.ok(selectedRecord(payloads[0])===null||selectedRecord(payloads[0]).id==='a');assert.deepEqual(payloads[0].picked.privateExtra,picked.privateExtra);
 const other=await fixture(t),later=[];other.action([set('records',original.map(row=>({...row,name:row.name+'编辑'}))),set('records',reordered),submit],text=>later.push(parsePayload(text)));cleared(later[0]);
});

test('same typed unique business id at the same index preserves selection across content edits',async t=>{
 const rows=[{id:1,name:'数字'},{id:'1',name:'字符串'}],store=await fixture(t,{rows,selection:{...picked,selected:1}}),payloads=[];
 const edited=[{id:1,name:'数字已编辑'},{id:'1',name:'字符串已编辑'}];store.action([set('records',edited),submit],text=>payloads.push(parsePayload(text)));
 assert.equal(payloads[0].picked.selected,1);assert.equal(selectedRecord(payloads[0]).id,'1');assert.equal(selectedRecord(payloads[0]).name,'字符串已编辑');assert.deepEqual(payloads[0].picked.privateExtra,picked.privateExtra);
});

for(const rows of [[{id:'same',name:'甲'},{id:'same',name:'乙'}],[[1,'甲'],['1','乙']]])test('duplicate IDs and typed array rows do not retarget selection on reorder: '+JSON.stringify(rows),async t=>{
 const store=await fixture(t,{rows}),payloads=[];store.action([set('records',[...rows].reverse()),submit],text=>payloads.push(parsePayload(text)));cleared(payloads[0]);
});

for(const selected of [0,1])test('indistinguishable legacy duplicate rows clear when their projection changes at index '+selected,async t=>{
 const same={name:'同值'},rows=[same,same,{name:'其他'}],store=await fixture(t,{rows,selection:{...picked,selected}}),payloads=[];
 store.action([set('records',[same,{name:'其他'}]),submit],text=>payloads.push(parsePayload(text)));cleared(payloads[0]);
});

test('incompatible projections sharing one numeric bind clear once in an atomic explicit selection',async t=>{
 const extra=',Table(["id","name"],[$records[2],$records[1],$records[0]],"逆序记录","picked")';
 const store=await fixture(t,{selection:{...picked,selected:1},source:sourceFor(original,extra)}),payloads=[];
 store.action([set('picked',{...picked,selected:0}),submit],text=>payloads.push(parsePayload(text)));cleared(payloads[0]);cleared(store.state);
});

test('unrelated set and submit-only operations retain old selected values and extra state exactly',async t=>{
 const store=await fixture(t),before=structuredClone(store.state),payloads=[];
 store.action(submit,text=>payloads.push(parsePayload(text)));assert.deepEqual(store.state,before);assert.deepEqual(payloads[0].picked,picked);assert.equal(store.dirty.size,0);
 store.action(set('unrelated',{legacy:['NEW']}));assert.deepEqual(store.state.picked,picked);assert.deepEqual(store.state.records,original);
 const array=await fixture(t,{selection:['legacy',0,false]});array.set('records',reordered);assert.deepEqual(array.state.picked,['legacy',0,false],'foreign array state remains intact');
});

test('failed transactions publish no submit and leave selection, rows, dirty and snapshot unchanged',async t=>{
 for(const actions of [[set('records',reordered),submit,{type:'unknown',name:'invalid'}],[set('records',reordered),submit,submit],[set('records',[{name:{invalid:'object cell'}}]),submit]]){
  const store=await fixture(t),before=structuredClone(store.state),snapshot=store.snapshot,dirty=[...store.dirty],payloads=[];
  assert.throws(()=>store.action(actions,text=>payloads.push(text)));assert.deepEqual(payloads,[]);assert.deepEqual(store.state,before);assert.equal(store.snapshot,snapshot);assert.deepEqual([...store.dirty],dirty);
 }
});


test('actual React atomic Button submit is reconciled before callback, not by a later layout effect',async t=>{
 const source='$records = '+JSON.stringify(original)+'\nroot = Stack([Table(["id","name"],$records,"记录","picked"),Text($picked.selected == null ? "当前：无" : concat("当前：",$records[$picked.selected].id)),Button("重排并提交",[{type:"set",name:"records",value:'+JSON.stringify(reordered)+'},{type:"submit",text:"调整后执行",fields:["records","picked"]}]),Form("当前提交",[],[],"当前提交",$picked.selected == null ? "无" : concat("",$records[$picked.selected].id)),Button("提交当前",{type:"submit",text:"当前所选",fields:["records","picked"]})])';
 const bundle=await build({stdin:{resolveDir:root,loader:'jsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {IntelligentSurface} from './src/client/Surface.jsx';import {acquireDocument,disposeDocuments} from './src/client/document-store.mjs';
const {store}=acquireDocument('synthetic-atomic-table','table');window.atomicTable={store,payloads:[],callbackStates:[],dispose:disposeDocuments};
createRoot(document.getElementById('root')).render(<IntelligentSurface source={${JSON.stringify(source)}} sessionId="synthetic-atomic-table" blockId="table" onSubmit={text=>{window.atomicTable.payloads.push(text);window.atomicTable.callbackStates.push(structuredClone(store.state));}}/>);`},bundle:true,format:'iife',platform:'browser',write:false});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CFT_EXECUTABLE||chromium.executablePath(),args:['--use-mock-keychain','--password-store=basic']});
 const page=await browser.newPage({viewport:{width:320,height:844}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
 t.after(async()=>{await page.evaluate(()=>window.atomicTable?.dispose()).catch(()=>{});await browser.close();assert.deepEqual(errors,[]);});
 let record={revision:0,componentsVersion:2,sourceRevision:createHash('sha256').update(source).digest('hex'),state:{records:original,picked}};
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).pathname.includes('/intelligent-ui/api/state')){
   if(route.request().method()==='POST')record={...route.request().postDataJSON(),revision:record.revision+1};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(record)});
  }
  return route.fulfill({body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'});
 });
 await page.goto('http://127.0.0.1:9191/');await page.addStyleTag({content:'body{margin:0;padding:12px}'+await readFile(join(root,'src/client/styles/surface.css'),'utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByRole('status').filter({hasText:'已保存'}).waitFor();assert.deepEqual(await page.evaluate(()=>window.atomicTable.store.state.picked),picked);
 await page.getByRole('button',{name:'重排并提交',exact:true}).click();await page.getByText('当前：无',{exact:true}).waitFor();
 const result=await page.evaluate(()=>({state:structuredClone(window.atomicTable.store.state),payloads:window.atomicTable.payloads,callbackStates:window.atomicTable.callbackStates,selectedRows:[...document.querySelectorAll('tr.is-selected')].map(row=>row.innerText),overflow:document.documentElement.scrollWidth-innerWidth}));
 if(process.env.IUI_UI_EVIDENCE){await mkdir(process.env.IUI_UI_EVIDENCE,{recursive:true});await page.screenshot({path:join(process.env.IUI_UI_EVIDENCE,'atomic-table-transaction-320.png'),fullPage:true});const {writeFile}=await import('node:fs/promises');await writeFile(join(process.env.IUI_UI_EVIDENCE,'atomic-table-transaction.json'),JSON.stringify(result,null,2)+'\n');}
 assert.equal(result.payloads.length,1);const payload=parsePayload(result.payloads[0]);cleared(payload);cleared(result.callbackStates[0]);cleared(result.state);assert.equal(selectedRecord(payload),null);assert.deepEqual(result.selectedRows,[]);assert.ok(result.overflow<=1);
 await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();await page.getByRole('button',{name:'当前提交',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.atomicTable.payloads[1]),'a','explicit reselection after reorder submits the intended record');
 await page.evaluate(()=>window.atomicTable.store.set('records',[{name:'同值'},{name:'同值'},{name:'其他'}]));
 await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();assert.equal(await page.evaluate(()=>window.atomicTable.store.state.picked.selected),1,'a real duplicate-row click is accepted');
 assert.match(await page.locator('tr.is-selected').innerText(),/同值/);
 await page.getByRole('button',{name:'提交当前',exact:true}).click();const duplicate=parsePayload(await page.evaluate(()=>window.atomicTable.payloads[2]));assert.equal(duplicate.picked.selected,1);assert.equal(selectedRecord(duplicate).name,'同值');assert.equal(typeof duplicate.picked.selectedTransient,'string');
 await page.getByRole('button',{name:'重排并提交',exact:true}).click();await page.getByText('当前：无',{exact:true}).waitFor();cleared(parsePayload(await page.evaluate(()=>window.atomicTable.payloads[3])));
});

for(const source of [
 '$records = '+JSON.stringify(original)+'\n$alternate = false\nroot = $alternate ? Table(["id","name"],$records,"新分支","picked") : Table(["id","name"],$records,"旧分支","picked")',
 '$records = '+JSON.stringify(original)+'\n$alternate = false\noldTable = Table(["id","name"],$records,"旧别名","picked")\nnewTable = Table(["id","name"],$records,"新别名","picked")\nroot = Stack([$alternate ? newTable : oldTable])',
 '$records = '+JSON.stringify(original)+'\n$alternate = false\n$groups = [{id:"A"}]\nroot = Stack(each($groups,g,Table(["id","name"],$records,g.id,"picked")))'
])test('a changed conditional/alias/collection path does not discard prior numeric binding evidence: '+source.split('\n').at(-1),async t=>{
 const store=await fixture(t,{source}),payloads=[];
 store.action([set('records',reordered),set('alternate',true),set('groups',[{id:'B'}]),submit],text=>payloads.push(parsePayload(text)));
 cleared(payloads[0]);cleared(store.state);assert.equal(selectedRecord(payloads[0]),null);
});

for(const first of [{name:'原唯一行'},[1,'原唯一行']])test('a newly duplicated unkeyed row cannot retain a legacy selection through an ambiguous layout: '+JSON.stringify(first),async t=>{
 const rows=[first,Array.isArray(first)?[2,'其他']:{name:'其他'}],store=await fixture(t,{rows}),payloads=[];
 store.action([set('records',[first,structuredClone(first),rows[1]]),submit],text=>payloads.push(parsePayload(text)));
 cleared(payloads[0]);cleared(store.state);
});

test('a fresh explicit transient duplicate-row selection remains usable in its unchanged projection',async t=>{
 const same={name:'同值'},rows=[same,same,{name:'其他'}],store=await fixture(t,{rows,selection:{...picked,selected:null}});
 const selection={...picked,selected:1,selectedIdentity:null,selectedTransient:'table:new-selection'};
 store.set('picked',selection);assert.deepEqual(store.state.picked,selection,'a real Table duplicate-row click is an explicit new selection intent');
 const payloads=[];store.action(submit,text=>payloads.push(parsePayload(text)));assert.equal(payloads[0].picked.selected,1);assert.equal(payloads[0].picked.selectedTransient,selection.selectedTransient);
 store.set('records',[same,{name:'其他'}]);cleared(store.state);
});

for(const fields of [{selectedIdentity:42},{selectedTransient:0},{selectedTransient:{}},{selectedIdentity:''}])test('invalid selection evidence is cleared before an explicit atomic submit: '+JSON.stringify(fields),async t=>{
 const store=await fixture(t),payloads=[];store.action([set('picked',{...picked,...fields}),submit],text=>payloads.push(parsePayload(text)));cleared(payloads[0]);cleared(store.state);
});


test('a transient duplicate-row selection is rejected for multiple Table views before submit',async t=>{
 const same={name:'同值'},rows=[same,same,{name:'其他'}],extra=',Table(["name"],$records,"另一视图","picked")';
 const store=await fixture(t,{rows,selection:{...picked,selected:null},source:sourceFor(rows,extra)}),payloads=[];
 store.action([set('picked',{...picked,selected:1,selectedIdentity:null,selectedTransient:'table:local-only'}),submit],text=>payloads.push(parsePayload(text)));
 cleared(payloads[0]);cleared(store.state);
});

test('Tables inside authored layout and hidden Tabs children are reconciled as mounted views',async t=>{
 const source='$records='+JSON.stringify(original)+'\nroot=Tabs(["说明","名单"],[Text("说明面板"),Card([Stack([Table(["id","name"],$records,"嵌套名单","picked")])])],"tab", "说明")';
 const store=await fixture(t,{source}),payloads=[];store.action([set('records',reordered),submit],text=>payloads.push(parsePayload(text)));cleared(payloads[0]);
});

test('raw Table-shaped action data cannot contribute a projection or clear a real Table selection',async t=>{
 const fake={name:'Table',props:{columns:['id','name'],rows:reordered,caption:'原始数据',bind:'picked'},path:'root.fake'};
 const source=sourceFor(original,',Button("保存原始数据",{type:"set",name:"artifact",value:'+JSON.stringify(fake)+'})');
 const store=await fixture(t,{source}),payloads=[];store.action(submit,text=>payloads.push(parsePayload(text)));assert.deepEqual(payloads[0].picked,picked);assert.equal(selectedRecord(payloads[0]).id,'a');assert.equal(store.dirty.size,0);
});

const disappearingSource='$records='+JSON.stringify(original)+'\n$hide = false\nroot=$hide ? Text("名单隐藏") : Table(["id","name"],$records,"记录","picked")';
test('retiring a previously mounted Table before atomic reorder cannot submit its stale public index',async t=>{
 const store=await fixture(t,{source:disappearingSource}),payloads=[];
 store.action([set('hide',true),set('records',reordered),submit],text=>payloads.push(parsePayload(text)));cleared(payloads[0]);cleared(store.state);assert.equal(selectedRecord(payloads[0]),null);
 assert.equal(store.snapshot.tree.name,'Text');assert.ok(store.dirty.has('picked'),'selection clearing joins the transaction save');assert.deepEqual(store.state.unrelated,{legacy:['keep',false,0]});
});

test('hide-only retirement clears selection while retaining records and permits an explicit choice after remount',async t=>{
 const store=await fixture(t,{source:disappearingSource});store.set('hide',true);cleared(store.state);assert.deepEqual(store.state.records,original);assert.deepEqual(store.state.picked.privateExtra,picked.privateExtra);
 store.set('hide',false);assert.equal(store.state.picked.selected,null);assert.equal(store.snapshot.tree.name,'Table');
 const payloads=[];store.action([set('picked',{...picked,selected:1}),submit],text=>payloads.push(parsePayload(text)));assert.equal(payloads[0].picked.selected,1);assert.equal(selectedRecord(payloads[0]).id,'b');
});

test('initially hidden historical state is not inferred to be a retired Table or migrated',async t=>{
 const source=disappearingSource.replace('$hide = false','$hide = true'),store=await fixture(t,{source}),before=structuredClone(store.state),payloads=[];
 assert.equal(store.snapshot.tree.name,'Text');store.action(submit,text=>payloads.push(parsePayload(text)));assert.deepEqual(store.state,before);assert.deepEqual(payloads[0].picked,picked);assert.equal(store.dirty.size,0);
 store.set('hide',false);assert.equal(store.snapshot.tree.name,'Table');assert.deepEqual(store.state.picked,picked,'first visible projection still accepts the original numeric value');
});
