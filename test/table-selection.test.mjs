import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = await readFile(join(root, 'src/client/styles/surface.css'), 'utf8');
const evidence = process.env.IUI_UI_EVIDENCE;
const source = '$hideFirst = false\n$picked = {sort:null,direction:"asc",selected:null}\nallRows = [{name:"甲",score:1},{name:"乙",score:2},{name:"丙",score:3}]\nrows = Filter(allRows,row,!$hideFirst || row.name != "甲")\nroot = Stack([Checkbox("隐藏甲","hideFirst",false),Table([{key:"name",label:"姓名"},{key:"score",label:"分数"}],rows,"动态名单","picked"),Text($picked.selected == null ? "所选：未选择" : concat("所选：",rows[$picked.selected].name)),Button("读取选中行",{type:"set",name:"captured",value:$picked.selected == null ? "未选择" : rows[$picked.selected].name}),Form("执行选中记录",[],[],"执行选中记录",$picked.selected == null ? "未选择" : rows[$picked.selected].name)])';
const bundle = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
import React,{useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Table} from './src/client/components/data.jsx';
import {IntelligentSurface} from './src/client/Surface.jsx';
import {acquireDocument,disposeDocuments} from './src/client/document-store.mjs';
function LateSelection({armed}){useLayoutEffect(()=>{if(armed)document.querySelectorAll('.iui-row-select')[1]?.click();},[armed]);return null;}
function App(){
 const [state,setState]=useState({table:{sort:null,direction:'asc',selected:null}}),[rows,setRows]=useState([{name:'甲',score:1},{name:'乙',score:2},{name:'丙',score:3}]),[paired,setPaired]=useState(false),[rowKey,setRowKey]=useState(null),[locked,setLocked]=useState(false),[late,setLate]=useState(false);
 const live=useRef(state);live.current=state;
 const write=(name,value)=>{const next={...live.current,[name]:value};live.current=next;setState(next);};
 window.tableHarness={state,rows,setRows,setPaired,setRowKey:key=>setRowKey(()=>key),setLocked,setLate,setBound:value=>write('table',value),writes:window.tableHarness?.writes||0};
 const api={state,disabled:locked,set:(name,value)=>{window.tableHarness.writes++;write(name,value);},evaluate:formula=>live.current[formula.slice(1)]};
 const props={columns:[{key:'name',label:'姓名'},{key:'score',label:'分数'}],rows,caption:'名单',bind:'table',rowKey};
 return <div className="iui-surface"><LateSelection armed={late}/><Table props={props} api={api}/>{paired&&<Table props={{...props,rows:[...rows].reverse(),caption:'反向共享名单'}} api={api}/>}</div>;
}
if(window.surfaceMode){
 const {store}=acquireDocument('synthetic-table','table');
 window.tableSurface={store,dispose:disposeDocuments,submissions:[]};
 createRoot(document.getElementById('root')).render(<IntelligentSurface source={${JSON.stringify(source)}} sessionId="synthetic-table" blockId="table" store={store} onSubmit={text=>window.tableSurface.submissions.push(text)}/>);
}else createRoot(document.getElementById('root')).render(<App/>);
` }, bundle: true, format: 'iife', platform: 'browser', write: false });
async function mount(t, { width = 800, dark = false, surface = false } = {}) {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CFT_EXECUTABLE||chromium.executablePath(),args:['--use-mock-keychain','--password-store=basic']});
 t.after(()=>browser.close());
 const page = await browser.newPage({viewport:{width,height:844}}),errors=[];page.setDefaultTimeout(5000);
 page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 let record={revision:0,componentsVersion:3,sourceRevision:createHash('sha256').update(source).digest('hex'),state:{}};
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).pathname.includes('/intelligent-ui/api/state')){
   if(route.request().method()==='POST')record={...route.request().postDataJSON(),revision:record.revision+1};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(record)});
  }
  return route.fulfill({body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'});
 });
 await page.goto('http://127.0.0.1:9191/');
 await page.addStyleTag({content:'body{margin:0;padding:16px} #root{min-width:0}'+css});
 await page.evaluate(({dark,surface})=>{if(dark)document.body.setAttribute('data-ds-dark-theme','');window.surfaceMode=surface;},{dark,surface});
 await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('table').first().waitFor();if(surface)await page.getByRole('status').filter({hasText:'已保存'}).waitFor();return page;
}
const state = page=>page.evaluate(()=>window.tableHarness.state.table);
const selected = page=>page.locator('table').first().locator('tbody tr.is-selected');
const settle = page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const rows = async (page,value)=>{await page.evaluate(value=>window.tableHarness.setRows(value),value);await settle(page);};
async function capture(page,name){if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,name+'.png'),fullPage:true});}}

for(const view of [{width:800,dark:false},{width:320,dark:true}])test(`Table selection follows an actual OpenUI Filter interaction at ${view.width}px`,async t=>{
 const page=await mount(t,{...view,surface:true});
 await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();assert.match(await selected(page).innerText(),/乙/);
 await page.getByRole('checkbox',{name:'隐藏甲'}).check();assert.equal(await selected(page).count(),0,'filtering a preceding row clears an incompatible public index');assert.equal(await page.evaluate(()=>window.tableSurface.store.state.picked.selected),null);
 await page.getByRole('button',{name:'选择第 1 行',exact:true}).click();
 await page.getByRole('button',{name:'分数',exact:true}).click();await page.getByRole('button',{name:'分数',exact:true}).click();
 assert.match(await selected(page).innerText(),/乙/);assert.equal(await page.locator('tbody tr').first().innerText(),'○\t丙\t3');
 assert.equal((await page.evaluate(()=>window.tableSurface.store.state.picked)).selected,0,'explicit sorting records the current source-row index');
 await page.getByRole('status').filter({hasText:'已保存'}).waitFor();
 await page.reload();await page.addStyleTag({content:'body{margin:0;padding:16px} #root{min-width:0}'+css});
 await page.evaluate(dark=>{window.surfaceMode=true;if(dark)document.body.setAttribute('data-ds-dark-theme','');},view.dark);
 await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByRole('status').filter({hasText:'已保存'}).waitFor();
 assert.match(await selected(page).innerText(),/乙/,'the saved filtered selection restores through the production DocumentStore');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);
 await capture(page,`table-filter-${view.width}-${view.dark?'dark':'light'}`);
});

test('shared projections clear incompatible public indexes with one bounded write',async t=>{
 const page=await mount(t);await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();
 await page.evaluate(()=>window.tableHarness.setPaired(true));await page.locator('table').nth(1).waitFor();
 assert.match(await selected(page).innerText(),/乙/);assert.match(await page.locator('table').nth(1).locator('tr.is-selected').innerText(),/乙/);
 const writes=await page.evaluate(()=>window.tableHarness.writes);
 await page.evaluate(()=>window.tableHarness.setRows(window.tableHarness.rows.slice(1)));await settle(page);
 assert.equal(await page.locator('tr.is-selected').count(),0);assert.equal((await state(page)).selected,null);
 assert.equal(await page.evaluate(()=>window.tableHarness.writes),writes+1,'the second view reads the already cleared current store value');
 await settle(page);assert.equal(await page.evaluate(()=>window.tableHarness.writes),writes+1,'clearing converges without repeat writes');
 await page.locator('table').first().getByRole('button',{name:'选择第 1 行',exact:true}).click();await settle(page);
 assert.equal((await state(page)).selected,null,'different row indexes for the same identity cannot share one numeric selection');
 assert.equal(await page.evaluate(()=>window.tableHarness.writes),writes+3,'one explicit selection and one incompatible-view clear');
 await rows(page,[{name:'替换记录',score:9},{name:'另一记录',score:2}]);assert.equal(await selected(page).count(),0);
});

test('business keys follow content edits and distinguish typed or duplicate values',async t=>{
 const page=await mount(t);
 await rows(page,[{id:1,name:'重复',score:1},{id:'1',name:'重复',score:1},{id:'last',name:'尾行',score:3}]);
 await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();
 await rows(page,[{id:1,name:'更新甲',score:2},{id:'1',name:'更新乙',score:99}]);
 assert.match(await selected(page).innerText(),/更新乙.*99/,'string and numeric IDs remain distinct across content edits');
 await page.getByRole('button',{name:'选择第 2 行',exact:true}).focus();await page.keyboard.press('Space');assert.equal(await selected(page).count(),0);
 await page.keyboard.press('Enter');assert.match(await selected(page).innerText(),/更新乙/);
 await rows(page,[{id:'1',name:'更新乙',score:99},{id:'1',name:'新重复key',score:4}]);assert.equal(await selected(page).count(),0,'a newly ambiguous business key cannot transfer selection');
 await rows(page,[{id:'duplicate',name:'甲',score:1},{id:'duplicate',name:'乙',score:2}]);
 await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();
 await rows(page,[{id:'duplicate',name:'乙',score:2},{id:'duplicate',name:'甲',score:1}]);assert.equal(await selected(page).count(),0,'reordering duplicate IDs clears the incompatible public index');
 await page.getByRole('button',{name:'选择第 1 行',exact:true}).click();
 await rows(page,[{id:'duplicate',name:'更改乙',score:2},{id:'duplicate',name:'甲',score:1}]);assert.equal(await selected(page).count(),0,'an edited row with a duplicate key has no safe business identity');
});

test('direct consumer rowKey props preserve business identity without requiring public row IDs',async t=>{
 const page=await mount(t);await page.evaluate(()=>window.tableHarness.setRowKey('code'));
 await rows(page,[{code:'a',name:'甲',score:1},{code:'b',name:'乙',score:2}]);await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();
 await rows(page,[{code:'a',name:'甲',score:1},{code:'b',name:'更新乙',score:4}]);assert.match(await selected(page).innerText(),/更新乙/);
 await page.evaluate(()=>window.tableHarness.setRowKey(row=>row.code));await settle(page);assert.match(await selected(page).innerText(),/更新乙/);
});

test('array rows and indistinguishable duplicates clear ambiguous selection on projection changes',async t=>{
 const page=await mount(t);
 await rows(page,[['甲',1],['乙',2],['丙',3]]);await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();
 await rows(page,[['丙',3],['乙',2]]);assert.match(await selected(page).innerText(),/乙/,'array row at the same public index remains selected');
 await page.evaluate(()=>{const duplicate={name:'重复',score:1};window.tableHarness.setRows([duplicate,duplicate,{name:'尾行',score:3}]);});
 await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();assert.equal(await selected(page).count(),1);
 const bound=await state(page);assert.equal(bound.selected,1);assert.equal(bound.selectedIdentity,null);
 await page.evaluate(bound=>window.tableHarness.setBound({...bound,selected:0}),bound);await settle(page);assert.equal(await selected(page).count(),0,'a transient token is valid only for its captured index');
 await page.evaluate(bound=>window.tableHarness.setBound(bound),bound);await settle(page);
 await page.getByRole('button',{name:'分数',exact:true}).click();assert.equal(await selected(page).count(),1,'sort within the unchanged authored rows keeps the chosen duplicate');
 await page.evaluate(()=>window.tableHarness.setRows(window.tableHarness.rows.slice(1)));await settle(page);assert.equal(await selected(page).count(),0,'filtering duplicates cannot move the selected occurrence to a neighbor');
 await page.evaluate(bound=>window.tableHarness.setBound(bound),bound);assert.equal(await selected(page).count(),0,'old duplicate evidence cannot reselect a changed layout');
});

test('legacy numeric selections restore unchanged and preserve extra fields when projection clearing is necessary',async t=>{
 const page=await mount(t),legacy={sort:'score',direction:'desc',selected:1,thirdParty:['keep']};
 await page.evaluate(value=>window.tableHarness.setBound(value),legacy);assert.match(await selected(page).innerText(),/乙/);
 const writes=await page.evaluate(()=>window.tableHarness.writes);
 assert.deepEqual(await state(page),legacy);assert.equal(await page.evaluate(()=>window.tableHarness.writes),writes);
 await page.evaluate(()=>window.tableHarness.setRows(window.tableHarness.rows.slice(1)));await settle(page);assert.equal(await selected(page).count(),0);
 assert.equal((await state(page)).selected,null);assert.deepEqual((await state(page)).thirdParty,['keep']);assert.equal(await page.evaluate(()=>window.tableHarness.writes),writes+1);
 await page.getByRole('button',{name:'选择第 1 行',exact:true}).click();
 await page.getByRole('button',{name:'姓名',exact:true}).click();assert.equal((await state(page)).selected,0);assert.deepEqual((await state(page)).thirdParty,['keep']);
 const migrated=await state(page);await page.reload();await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('table').waitFor();
 await page.evaluate(value=>window.tableHarness.setBound(value),migrated);await settle(page);assert.equal(await selected(page).count(),0,'a restored identity with an index incompatible with the current rows is cleared');assert.equal((await state(page)).selected,null);
 await page.evaluate(()=>{window.tableHarness.setRows([{name:'新甲',score:10},{name:'新乙',score:20}]);window.tableHarness.setBound({selected:1,thirdParty:['keep']});});await settle(page);assert.match(await selected(page).innerText(),/新乙/,'a newer explicit legacy index selection is accepted in its current row view');
 await page.evaluate(()=>window.tableHarness.setBound(['old','values']));await rows(page,[{name:'丙',score:3}]);assert.deepEqual(await state(page),['old','values']);assert.equal(await selected(page).count(),0);
});

test('disabled interactions and stale or out-of-range selections never change data or select a neighbor',async t=>{
 const page=await mount(t);await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();
 const saved=await state(page);await page.evaluate(value=>window.tableHarness.setBound({...value,selected:null}),saved);await settle(page);assert.equal(await selected(page).count(),0,'legacy explicit deselection overrides retained metadata');
 await page.evaluate(value=>window.tableHarness.setBound(value),saved);await settle(page);
 await rows(page,[{name:'甲',score:1},{name:'乙',score:99},{name:'丙',score:3}]);assert.equal(await selected(page).count(),0,'unkeyed content changes have no stable record identity');
 await page.evaluate(()=>{window.tableHarness.setBound({selected:99});window.tableHarness.setLocked(true);});
 const before=await state(page),writes=await page.evaluate(()=>window.tableHarness.writes);
 await page.getByRole('button',{name:'选择第 1 行',exact:true}).dispatchEvent('click');await page.getByRole('button',{name:'分数',exact:true}).dispatchEvent('click');
 assert.equal(await selected(page).count(),0);assert.deepEqual(await state(page),before);assert.equal(await page.evaluate(()=>window.tableHarness.writes),writes);
 await rows(page,[]);assert.equal(await selected(page).count(),0);assert.equal(await page.getByText('暂无数据',{exact:true}).count(),1);
});


test('public selected and actual formula/action agree after a Filter projection change',async t=>{
 const page=await mount(t,{surface:true});
 await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();assert.equal(await page.getByText('所选：乙',{exact:true}).count(),1);
 await page.getByRole('button',{name:'读取选中行',exact:true}).click();assert.equal(await page.evaluate(()=>window.tableSurface.store.state.captured),'乙');
 await page.getByRole('checkbox',{name:'隐藏甲'}).check();
 assert.equal(await page.getByText('所选：未选择',{exact:true}).count(),1,'the public selected index must be cleared instead of resolving to 丙');
 assert.equal(await page.evaluate(()=>window.tableSurface.store.state.picked.selected),null);
 await page.getByRole('button',{name:'读取选中行',exact:true}).click();assert.equal(await page.evaluate(()=>window.tableSurface.store.state.captured),'未选择');
 await page.getByRole('button',{name:'执行选中记录',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.tableSurface.submissions),['未选择']);
 await page.getByRole('button',{name:'选择第 1 行',exact:true}).click();assert.equal(await page.getByText('所选：乙',{exact:true}).count(),1);
 await page.getByRole('button',{name:'读取选中行',exact:true}).click();assert.equal(await page.evaluate(()=>window.tableSurface.store.state.captured),'乙');
 await page.getByRole('button',{name:'执行选中记录',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.tableSurface.submissions),['未选择','乙']);
});


test('a newer row click in the same commit supersedes stale projection-clearing effects',async t=>{
 const page=await mount(t);await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();
 const writes=await page.evaluate(()=>window.tableHarness.writes);
 await page.evaluate(()=>{window.tableHarness.setRows(window.tableHarness.rows.slice(1));window.tableHarness.setLate(true);});await settle(page);
 assert.match(await selected(page).innerText(),/丙/,'a real button click during the new rows commit wins over old selection evidence');
 assert.equal((await state(page)).selected,1);assert.equal(await page.evaluate(()=>window.tableHarness.writes),writes+1,'the stale effect does not clear the newer clicked state');
 await page.getByRole('button',{name:'选择第 1 行',exact:true}).click();await settle(page);assert.match(await selected(page).innerText(),/乙/);assert.equal((await state(page)).selected,0);
});

test('disabled projections do not write, then clear their incompatible public index on unlock',async t=>{
 const page=await mount(t);await page.getByRole('button',{name:'选择第 2 行',exact:true}).click();
 const saved=await state(page),writes=await page.evaluate(()=>window.tableHarness.writes);
 await page.evaluate(()=>{window.tableHarness.setLocked(true);window.tableHarness.setRows(window.tableHarness.rows.slice(1));});await settle(page);
 assert.deepEqual(await state(page),saved);assert.equal(await page.evaluate(()=>window.tableHarness.writes),writes);
 await page.evaluate(()=>window.tableHarness.setLocked(false));await settle(page);assert.equal((await state(page)).selected,null);assert.equal(await page.evaluate(()=>window.tableHarness.writes),writes+1);
});
