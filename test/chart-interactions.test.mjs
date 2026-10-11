import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { compile, evaluateDocument } from '../src/runtime/evaluate.mjs';
import { assertJSON } from '../src/runtime/limits.mjs';
import { DocumentStore } from '../src/client/document-store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = await readFile(join(root, 'src/client/styles/surface.css'), 'utf8');
const evidence = process.env.IUI_UI_EVIDENCE;
const data = [{category:'甲',position:1,sales:30,profit:10},{category:'乙',position:2,sales:60,profit:30},{category:'丙',position:3,sales:10,profit:60}];
const unitData = data.map((row,index)=>({...row,capacity:[100,500,2000][index]}));
const unitSeries = [{key:'sales',label:'销售额（元）',unit:'元'},{key:'profit',label:'利润',unit:'元'},{key:'capacity',label:'容量',unit:'GB'}];
const bundle = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Chart} from './src/client/components/data.jsx';
function App(){
 const [state,setState]=useState({chart:{hidden:[],selected:null}}),[type,setType]=useState('pie'),[disabled,setDisabled]=useState(false),[paired,setPaired]=useState(false),[rows,setRows]=useState(${JSON.stringify(data)}),[series,setSeries]=useState([{key:'sales',label:'销售额'},{key:'profit',label:'利润'}]),[categoryFilters,setCategoryFilters]=useState(false),[colorBy,setColorBy]=useState('series'),[xField,setXField]=useState(null);
 window.chartHarness={state,type,rows,setRows,setPaired,setType,setDisabled,setSeries,setCategoryFilters,setColorBy,setXField,setBound:value=>setState({chart:value}),actions:window.chartHarness?.actions||0,writes:window.chartHarness?.writes||0};
 const api={state,disabled,set:(name,value)=>{window.chartHarness.writes++;setState(old=>({...old,[name]:value}));},action:()=>window.chartHarness.actions++};
 return <div className="iui-surface" style={{maxWidth:720,padding:16}}><Chart api={api} props={{type,title:'分类业绩',x:xField||(type==='scatter'?'position':'category'),data:rows,series,bind:'chart',categoryFilters,colorBy}}/>{paired&&<Chart api={api} props={{type,title:'共享视图',x:xField||'category',data:[...rows].reverse(),series,bind:'chart',categoryFilters,colorBy}}/>}</div>;
}
createRoot(document.getElementById('root')).render(<App/>);` }, bundle:true, format:'iife', platform:'browser', write:false });
async function mount(t, options={}) {
 const browser=await chromium.launch({headless:true,executablePath:process.env.CFT_EXECUTABLE,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
 const page=await browser.newPage(options);const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.route('http://127.0.0.1:9191/**',route=>route.fulfill({body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'}));
 await page.goto('http://127.0.0.1:9191/');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('.iui-chart').waitFor();return page;
}
const state=page=>page.evaluate(()=>window.chartHarness.state.chart);
async function capture(page,name){if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,name+'.png'),fullPage:true});}}

test('pie chooses one metric while category legend, slices and shares stay consistent',async t=>{
 const page=await mount(t);
 const metric=page.getByRole('combobox',{name:'显示指标'});assert.equal(await metric.inputValue(),'sales');
 const slice=page.locator('svg [data-chart-row="0"]');assert.match(await slice.getAttribute('aria-label'),/甲.*销售额.*30.*30%/);
 const legend=page.locator('.iui-chart-legend').getByRole('button',{name:/^甲.*30.*30%/});assert.equal(await legend.locator('span').first().evaluate(el=>getComputedStyle(el).backgroundColor),await slice.evaluate(el=>getComputedStyle(el).fill));
 await metric.selectOption('profit');assert.equal((await state(page)).metric,'profit');assert.match(await slice.getAttribute('aria-label'),/甲.*利润.*10.*10%/);
 await page.locator('.iui-chart-legend').getByRole('button',{name:/^乙.*30.*30%/}).click();assert.deepEqual((await state(page)).hiddenCategories,['category:'+JSON.stringify(['string','乙'])]);assert.equal(await page.locator('svg [data-chart-row="1"]').count(),0);assert.match(await slice.getAttribute('aria-label'),/14\.3%/);
 await page.locator('.iui-chart-legend').getByRole('button',{name:/^乙.*已隐藏/}).click();assert.equal(await page.locator('svg [data-chart-row="1"]').count(),1);
 await capture(page,'pie-metric-categories-light');
});

test('all chart marks persist pointer/keyboard selection and share cancellation with the data table',async t=>{
 const page=await mount(t);
 for(const type of ['pie','line','area','bar','scatter']){
  await page.evaluate(type=>window.chartHarness.setType(type),type);
  const mark=page.locator('svg [data-chart-row="1"]').first();await mark.waitFor();
  const beforeHover=await page.evaluate(()=>window.chartHarness.writes);await mark.hover();assert.equal(await page.evaluate(()=>window.chartHarness.writes),beforeHover,'hover remains transient');
  await mark.click();assert.equal((await state(page)).selected,1,`${type}: click persists selection`);await page.mouse.move(0,0);assert.match(await page.locator('.iui-chart-description').textContent(),type==='scatter'?/2/:/乙/);
  await page.getByText('查看数据',{exact:true}).click();const row=page.getByRole('button',{name:type==='scatter'?'2':'乙',exact:true});assert.equal(await row.getAttribute('aria-pressed'),'true');await row.click();assert.equal((await state(page)).selected,null);await page.getByText('查看数据',{exact:true}).click();
  await mark.focus();await page.keyboard.press('Space');assert.equal((await state(page)).selected,1,`${type}: Space selects`);await page.keyboard.press('Escape');assert.equal((await state(page)).selected,null,`${type}: Escape clears`);
  await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.dataset.chartRow),'2');await page.keyboard.press('Enter');assert.equal((await state(page)).selected,2);await page.keyboard.press('Enter');assert.equal((await state(page)).selected,null,`${type}: repeat activation clears`);
 }
 assert.equal(await page.evaluate(()=>window.chartHarness.actions),0,'local chart interaction never submits a model action');
});

test('series filters remain local, disabled marks cannot change state, and touch works in a dark narrow chart',async t=>{
 const page=await mount(t,{viewport:{width:320,height:844},hasTouch:true,isMobile:true});await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
 const mark=page.locator('svg [data-chart-row="2"]');await mark.tap();assert.equal((await state(page)).selected,2);await capture(page,'pie-touch-dark-320');
 await page.evaluate(()=>window.chartHarness.setType('line'));await page.getByRole('button',{name:'利润',exact:true}).click();assert.deepEqual((await state(page)).hidden,['profit']);assert.equal(await page.locator('svg [data-chart-series="profit"]').count(),0);
 const targetBox=await page.locator('svg [data-chart-row="1"]').boundingBox();await page.touchscreen.tap(targetBox.x+targetBox.width/2+11,targetBox.y+targetBox.height/2+5);assert.equal((await state(page)).selected,1,'a touch beside the small visible point hits its expanded target');
 const writes=await page.evaluate(()=>window.chartHarness.writes);await page.locator('svg [data-chart-row="1"]').hover();await page.mouse.move(0,0);assert.equal(await page.evaluate(()=>window.chartHarness.writes),writes,'hover does not write state');
 await capture(page,'line-selected-dark-320');await page.evaluate(()=>window.chartHarness.setDisabled(true));const before=await state(page);const locked=page.locator('svg [data-chart-row="1"]').first();await locked.dispatchEvent('click');await locked.dispatchEvent('keydown',{key:'Enter'});assert.deepEqual(await state(page),before);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,'narrow chart stays inside viewport');await capture(page,'line-dark-320');
});


test('pie restores legacy series visibility and handles all categories or metrics hidden without misleading shares',async t=>{
 const page=await mount(t);
 await page.evaluate(()=>window.chartHarness.setBound({hidden:['sales'],selected:null}));
 assert.equal(await page.getByRole('combobox',{name:'显示指标'}).inputValue(),'profit');
 assert.match(await page.locator('svg [data-chart-row="2"]').getAttribute('aria-label'),/利润.*60.*60%/);
 await page.evaluate(()=>window.chartHarness.setBound({hidden:['sales','profit'],selected:null}));
 assert.equal(await page.locator('svg [data-chart-row]').count(),0);await page.getByRole('combobox',{name:'显示指标'}).selectOption('sales');
 assert.equal(await page.locator('svg [data-chart-row]').count(),3);
 await page.locator('svg [data-chart-row="0"]').click();
 for(const name of ['甲','乙','丙'])await page.locator('.iui-chart-legend').getByRole('button',{name:new RegExp('^'+name)}).click();
 assert.equal((await state(page)).selected,null,'filtering the selected category clears its selection');
 assert.equal(await page.locator('svg [data-chart-row]').count(),0);await page.getByText('当前分类没有正数数据',{exact:true}).waitFor();
 assert.equal(await page.locator('.iui-chart-legend').getByRole('button',{name:/已隐藏/}).count(),3);
 await page.locator('.iui-chart-legend').getByRole('button',{name:/^丙/}).click();
 assert.match(await page.locator('svg [data-chart-row="2"]').getAttribute('aria-label'),/100%/);
 assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);
 await page.evaluate(()=>{window.chartHarness.setSeries([{key:'sales',label:'销售额'}]);window.chartHarness.setBound({hidden:['sales'],selected:null});});
 await page.waitForFunction(()=>document.querySelector('.iui-chart-metric select')?.value==='');
 await page.getByRole('combobox',{name:'显示指标'}).selectOption('sales');
 assert.equal(await page.locator('svg [data-chart-row]').count(),3,'a legacy hidden single metric can be restored');
});


test('pie category filters and selections follow identities across data filtering and reordering',async t=>{
 const page=await mount(t);
 await page.locator('.iui-chart-legend').getByRole('button',{name:/^乙/}).click();
 await page.locator('svg [data-chart-row="2"]').click();
 await page.evaluate(()=>window.chartHarness.setRows(window.chartHarness.rows.slice(1)));
 await page.waitForFunction(()=>document.querySelectorAll('.iui-chart-legend-item').length===2);
 assert.equal(await page.locator('.iui-chart-legend').getByRole('button',{name:/^乙/}).getAttribute('aria-pressed'),'false','hidden category survives filtering');
 assert.equal(await page.locator('svg [data-chart-row="0"]').count(),0);
 assert.equal(await page.locator('svg [data-chart-row="1"]').getAttribute('aria-pressed'),'true','the selected category follows its identity');
 await page.evaluate(()=>window.chartHarness.setRows([...window.chartHarness.rows].reverse()));
 await page.waitForFunction(()=>document.querySelector('.iui-chart-legend-item').textContent.startsWith('丙'));
 assert.equal(await page.locator('svg [data-chart-row="0"]').getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>window.chartHarness.setRows(window.chartHarness.rows.filter(row=>row.category!=='丙')));
 await page.waitForFunction(()=>document.querySelectorAll('.iui-chart-legend-item').length===1);
 assert.equal(await page.getByRole('button',{name:'取消选择',exact:true}).count(),0,'a missing selected identity cannot silently select a different row');
});

test('24 dense line points select the exact touched visible center at 320 pixels',async t=>{
 const page=await mount(t,{viewport:{width:320,height:844},hasTouch:true,isMobile:true});
 await page.evaluate(()=>{window.chartHarness.setType('line');window.chartHarness.setSeries([{key:'sales',label:'值'}]);window.chartHarness.setRows(Array.from({length:24},(_,index)=>({category:'点'+index,sales:10})));});
 await page.waitForFunction(()=>document.querySelectorAll('svg [data-chart-row]').length===24);
 for(let index=0;index<24;index++){
  const point=page.locator(`svg [data-chart-row="${index}"] circle`).first();
  const center=await point.evaluate(el=>{const screen=el.getScreenCTM(),p=new DOMPoint(Number(el.getAttribute('cx')),Number(el.getAttribute('cy'))).matrixTransform(screen);return{x:p.x,y:p.y};});
  await page.touchscreen.tap(center.x,center.y);
  assert.equal((await state(page)).selected,index,`the visible circle center ${index} selects that circle rather than an overlapping neighbor`);
 }
 await capture(page,'dense-line-touch-320');
});

test('typed duplicate category groups filter together while explicit row IDs keep selections stable',async t=>{
 const page=await mount(t);
 await page.evaluate(()=>window.chartHarness.setRows([{category:1,sales:10},{category:'1',sales:20},{id:'a',category:'重复',sales:30},{id:'b',category:'重复',sales:40}]));
 await page.waitForFunction(()=>document.querySelectorAll('.iui-chart-legend-item').length===4);
 await page.locator('.iui-chart-legend-item').nth(0).click();
 assert.equal(await page.locator('svg [data-chart-row="0"]').count(),0);
 assert.equal(await page.locator('svg [data-chart-row="1"]').count(),1,'number 1 and string 1 are different categories');
 await page.locator('svg [data-chart-row="2"]').focus();await page.keyboard.press('Enter');
 await page.evaluate(()=>window.chartHarness.setRows([{id:'b',category:'重复',sales:45},{id:'a',category:'重复',sales:35},{category:'1',sales:20},{category:1,sales:10}]));
 await page.waitForFunction(()=>document.querySelector('svg [data-chart-row="1"]')?.getAttribute('aria-label').includes('35'));
 assert.equal(await page.locator('svg [data-chart-row="1"]').getAttribute('aria-pressed'),'true','selection follows unique ID even when its value changes');
 assert.equal((await state(page)).selected,2,'the compatible index records the last gesture without view-driven rewriting');
 await page.locator('.iui-chart-legend-item').nth(0).click();
 assert.equal(await page.locator('svg [data-chart-row="0"]').count(),0);
 assert.equal(await page.locator('svg [data-chart-row="1"]').count(),0,'the repeated typed category hides every row in that group');
 assert.equal((await state(page)).selected,null);
});

test('duplicate rows without IDs use exact rows, and ambiguous legacy index state is discarded',async t=>{
 const page=await mount(t);
 await page.evaluate(()=>window.chartHarness.setRows([{category:'重复',sales:10},{category:'重复',sales:20},{category:'其他',sales:30}]));
 await page.waitForFunction(()=>document.querySelector('svg [data-chart-row="1"]')?.getAttribute('aria-label').includes('重复'));
 await page.locator('svg [data-chart-row="1"]').focus();await page.keyboard.press('Enter');
 await page.evaluate(()=>window.chartHarness.setRows([{category:'重复',sales:20},{category:'其他',sales:30},{category:'重复',sales:10}]));
 await page.waitForFunction(()=>document.querySelector('svg [data-chart-row="0"]')?.getAttribute('aria-label').includes('20'));
 assert.equal(await page.locator('svg [data-chart-row="0"]').getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>window.chartHarness.setRows([{category:'重复',sales:22},{category:'其他',sales:30},{category:'重复',sales:10}]));
 await page.waitForFunction(()=>document.querySelector('svg [data-chart-row="0"]')?.getAttribute('aria-label').includes('22'));
 assert.equal(await page.locator('svg [aria-pressed="true"]').count(),0,'changing an ambiguous duplicate cannot silently select another row');
 await page.evaluate(()=>window.chartHarness.setBound({hidden:[],hiddenCategories:[1],selected:1}));
 await page.waitForFunction(()=>window.chartHarness.state.chart.selectedIdentity===undefined);
 assert.equal(await page.locator('svg [aria-pressed="true"]').count(),0,'legacy unanchored selection is ignored without rewriting shared state');
 assert.equal(await page.locator('svg [data-chart-row]').count(),3,'unanchored legacy category indexes are safely discarded');
});


test('largest legal charts and oversized duplicate rows select and save through the production store without copying data layouts',async t=>{
 const fields=Array.from({length:12},(_,index)=>`v${index}:10`).join(','),keys=Array.from({length:12},(_,index)=>`v${index}`);
 const note='x'.repeat(16000),wideRows=[{category:'重复',sales:10,a:note,b:note,c:note},{category:'重复',sales:20,a:note,b:note,c:note}];
 const cases=[
  `root = Chart("line",each(range(1000),i,{category:i,${fields}}),"category",${JSON.stringify(keys)},null,"chart")`,
  `root = Chart("line",each(range(500),i,{category:"同类",sales:i,note:${JSON.stringify('x'.repeat(70))}}),"category",["sales"],null,"chart")`,
  `root = Chart("line",${JSON.stringify(wideRows)},"category",["sales"],null,"chart")`,
  `root = Chart("line",[{category:"同类",sales:10},{category:"同类",sales:10}],"category",["sales"],null,"chart")`,
 ];
 const page=await mount(t);
 for(const [index,source] of cases.entries()){
  const node=evaluateDocument(compile(source));assertJSON(node.props.data);
  if(index===1)assert.throws(()=>assertJSON({selectedLayout:JSON.stringify(node.props.data)}),/文字过长/,'the previous full-layout persistence reproduces the limit failure');
  if(index===2)assert.throws(()=>assertJSON({selectedIdentity:'row:'+JSON.stringify(node.props.data[0])}),/文字过长/,'the previous full-row identity also exceeds the string limit');
  await page.evaluate(props=>{window.chartHarness.setBound({hidden:[],selected:null});window.chartHarness.setType('line');window.chartHarness.setRows(props.data);window.chartHarness.setSeries(props.series);},node.props);
  await page.waitForFunction(length=>document.querySelectorAll('svg [data-chart-row]').length===length,node.props.data.length*node.props.series.length);
  const point=page.locator('svg [data-chart-row="0"]').first();await point.focus();await page.keyboard.press('Enter');
  const chosen=await state(page);assert.equal(chosen.selected,0,`case ${index}: selection remains usable`);assert.equal(await page.getByRole('alert').count(),0);
  assert.ok(JSON.stringify(chosen).length<1024,`case ${index}: durable state stores compact selection evidence`);assertJSON(chosen);
  let remote={revision:0,sourceRevision:'chart-limit',state:{}};
  const store=new DocumentStore('chart-test','case-'+index,{hash:async()=> 'chart-limit',read:async(_s,_b,input)=>{if(input)remote={...input,revision:remote.revision+1};return structuredClone(remote);}});t.after(()=>store.dispose());
  store.update(source,false);for(let attempt=0;attempt<50&&store.snapshot.status==='loading';attempt++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(store.snapshot.status,'saved');store.set('chart',chosen);await store.save();assert.equal(store.snapshot.status,'saved');assert.equal(remote.state.chart.selected,0);
  if(index>=2){
   assert.equal(typeof chosen.selectedTransient,'string');assert.equal(chosen.selectedIdentity,null);
   await page.reload();await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('.iui-chart').waitFor();
   await page.evaluate(({props,chosen})=>{window.chartHarness.setRows(props.data);window.chartHarness.setSeries(props.series);window.chartHarness.setType('line');window.chartHarness.setBound(chosen);},{props:node.props,chosen});
   await page.waitForFunction(token=>window.chartHarness.state.chart.selectedTransient===token,chosen.selectedTransient);
   assert.equal(await page.locator('svg [aria-pressed="true"]').count(),0,'a reload clears selection that has no durable identity proof');
  }
 }
});


test('two differently ordered charts sharing a bind project selection without extra mutations',async t=>{
 const page=await mount(t);await page.evaluate(()=>window.chartHarness.setPaired(true));await page.locator('.iui-chart').nth(1).waitFor();
 const prior=await page.evaluate(()=>window.chartHarness.writes);
 await page.locator('.iui-chart').first().locator('svg [data-chart-row="0"]').focus();await page.keyboard.press('Enter');
 await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>window.chartHarness.writes),prior+1,'one explicit gesture causes exactly one state mutation across both views');
 assert.equal(await page.locator('.iui-chart').first().locator('svg [data-chart-row="0"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.iui-chart').nth(1).locator('svg [data-chart-row="2"]').getAttribute('aria-pressed'),'true');
});

test('non-pie charts plot same-unit series together and switch real scales without converting data',async t=>{
 const source=`root = Chart("bar",${JSON.stringify(unitData)},"category",${JSON.stringify(unitSeries)},"不同单位","chart")`;
 const props=evaluateDocument(compile(source)).props;
 const page=await mount(t);await page.evaluate(props=>{window.chartHarness.setRows(props.data);window.chartHarness.setSeries(props.series);window.chartHarness.setType('bar');},props);
 const metric=page.getByRole('combobox',{name:'显示指标'});await page.waitForFunction(()=>document.querySelector('.iui-chart-metric select')?.value==='元');
 assert.equal(await metric.inputValue(),'元','the first authored unit group is the default');
 assert.deepEqual(await metric.locator('option').allTextContents(),['销售额 / 利润（元）','容量（GB）'],'a shared unit is named once per grouped option');
 assert.equal((await state(page)).unit,undefined,'default projection does not persist a new field');
 for(const type of ['bar','line','area','scatter']){
  await page.evaluate(type=>window.chartHarness.setType(type),type);
  await page.waitForFunction(type=>window.chartHarness.type===type&&document.querySelectorAll('svg [data-chart-row]').length===6,type);
  assert.equal(await page.locator('svg [data-chart-series="sales"]').count(),3,`${type}: all sales points remain`);
  assert.equal(await page.locator('svg [data-chart-series="profit"]').count(),3,`${type}: same-unit profit stays simultaneous`);
  assert.equal(await page.locator('svg [data-chart-series="capacity"]').count(),0,`${type}: another unit cannot flatten this scale`);
  assert.ok((await page.locator('.iui-chart-canvas svg text').allTextContents()).includes('60'));
 }
 await page.evaluate(()=>window.chartHarness.setType('bar'));await page.locator('svg [data-chart-series="sales"] rect').first().waitFor();
 assert.equal(Number(await page.locator('svg [data-chart-series="sales"][data-chart-row="0"] rect').first().getAttribute('height')),126,'raw 30 is half the group maximum 60');
 assert.equal(await page.locator('.iui-chart-legend-item').first().textContent(),'销售额（元）','an existing exact unit suffix is not duplicated');
 assert.match(await page.locator('svg [data-chart-series="sales"][data-chart-row="0"]').getAttribute('aria-label'),/销售额（元）：30/);
 await metric.selectOption('GB');assert.equal((await state(page)).unit,'GB');
 assert.equal(await page.locator('svg [data-chart-row]').count(),3);assert.equal(await page.locator('svg [data-chart-series="sales"]').count(),0);
 assert.ok((await page.locator('.iui-chart-canvas svg text').allTextContents()).includes('2,000'));
 assert.ok(Math.abs(Number(await page.locator('svg [data-chart-row="0"] rect').first().getAttribute('height'))-12.6)<1e-9,'capacity 100 stays 100 on its own 2000 scale');
 assert.match(await page.locator('svg [data-chart-row="0"]').getAttribute('aria-label'),/容量（GB）：100/);
 await page.getByText('查看数据',{exact:true}).click();
 assert.deepEqual(await page.locator('.iui-chart-data thead th').allTextContents(),['category','销售额（元）','利润（元）','容量（GB）']);
 assert.deepEqual(await page.locator('.iui-chart-data tbody tr').first().locator('td').allTextContents(),['30','10','100'],'raw data remains available for every unit');
 let remote={revision:0,sourceRevision:'chart-unit',componentsVersion:4,state:{}};
 const storeOptions={hash:async()=> 'chart-unit',read:async(_s,_b,input)=>{if(input)remote={...input,revision:remote.revision+1};return structuredClone(remote);}};
 const store=new DocumentStore('chart-unit','unit-save',storeOptions);t.after(()=>store.dispose());store.update(source,false);
 for(let attempt=0;attempt<50&&store.snapshot.status==='loading';attempt++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(store.snapshot.status,'saved');store.set('chart',await state(page));await store.save();assert.equal(store.snapshot.status,'saved');
 assert.equal(remote.state.chart.unit,'GB','the production store durably saves an explicit unit choice');
 const restored=new DocumentStore('chart-unit','unit-restore',storeOptions);t.after(()=>restored.dispose());restored.update(source,false);
 for(let attempt=0;attempt<50&&restored.snapshot.status==='loading';attempt++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(restored.snapshot.status,'saved');assert.deepEqual(restored.state.chart,remote.state.chart,'fresh production store hydration preserves unit and hidden state');
 assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);await capture(page,'unit-group-capacity-raw-data');
});

test('unit changes retain row identity, independent series hiding and shared-view restoration',async t=>{
 const page=await mount(t);await page.evaluate(({rows,series})=>{window.chartHarness.setRows(rows);window.chartHarness.setSeries(series);window.chartHarness.setType('bar');},{rows:unitData,series:unitSeries});
 const metric=page.getByRole('combobox',{name:'显示指标'});await page.waitForFunction(()=>document.querySelector('.iui-chart-metric select')?.value==='元');
 await page.locator('.iui-chart-legend').getByRole('button',{name:'利润（元）',exact:true}).click();
 const row=page.locator('svg [data-chart-series="sales"][data-chart-row="1"]');await row.focus();await page.keyboard.press('Enter');
 const selected=await state(page),writes=await page.evaluate(()=>window.chartHarness.writes);
 await page.locator('svg [data-chart-row="0"]').hover();assert.equal(await page.evaluate(()=>window.chartHarness.writes),writes);
 await metric.selectOption('GB');
 assert.equal(await page.evaluate(()=>window.chartHarness.writes),writes+1,'switching units makes one explicit write and never rewrites selection');
 assert.equal((await state(page)).selectedIdentity,selected.selectedIdentity);assert.equal((await state(page)).selected,1);
 assert.equal(await page.locator('svg [data-chart-row="1"]').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('.iui-chart-description').textContent(),/乙.*容量（GB）：500/,'switch clears the transient hover and returns to the saved row');
 await page.getByText('查看数据',{exact:true}).click();assert.equal(await page.locator('.iui-chart-data').getByRole('button',{name:'乙',exact:true}).getAttribute('aria-pressed'),'true');
 await page.locator('.iui-chart-legend').getByRole('button',{name:'容量（GB）',exact:true}).click();
 assert.deepEqual((await state(page)).hidden,['profit','capacity']);assert.equal(await page.locator('svg [data-chart-row]').count(),0);
 await metric.selectOption('元');assert.equal(await page.locator('svg [data-chart-series="sales"]').count(),3);
 assert.equal(await page.locator('svg [data-chart-series="profit"]').count(),0,'profit remains hidden after visiting another unit');
 await page.locator('.iui-chart-legend').getByRole('button',{name:'利润（元）',exact:true}).click();
 assert.deepEqual((await state(page)).hidden,['capacity']);await metric.selectOption('GB');
 assert.equal(await page.locator('svg [data-chart-row]').count(),0,'capacity has its independent hidden state');
 await page.locator('.iui-chart-legend').getByRole('button',{name:'容量（GB）',exact:true}).click();const durable=await state(page);
 await page.evaluate(()=>window.chartHarness.setBound({hidden:['profit'],unit:'元',selected:null}));await page.waitForFunction(()=>document.querySelector('.iui-chart-metric select')?.value==='元');
 await page.evaluate(record=>window.chartHarness.setBound(record),durable);await page.waitForFunction(()=>document.querySelector('.iui-chart-metric select')?.value==='GB'&&document.querySelector('svg [data-chart-row="1"]')?.getAttribute('aria-pressed')==='true');
 assert.equal(await metric.inputValue(),'GB');assert.deepEqual(await state(page),durable);
 const beforeFilter=await page.evaluate(()=>window.chartHarness.writes);await page.evaluate(()=>window.chartHarness.setRows(window.chartHarness.rows.slice(1)));
 await page.waitForFunction(()=>document.querySelectorAll('svg [data-chart-row]').length===2);
 assert.equal(await page.locator('svg [data-chart-row="0"]').getAttribute('aria-pressed'),'true','the selected category survives a row filter');
 assert.equal((await state(page)).selected,1,'the last gesture index is not normalized by the view');assert.equal(await page.evaluate(()=>window.chartHarness.writes),beforeFilter);
 await page.evaluate(()=>window.chartHarness.setPaired(true));await page.locator('.iui-chart').nth(1).waitFor();
 const primary=page.locator('.iui-chart').first(),secondary=page.locator('.iui-chart').nth(1),beforeShared=await page.evaluate(()=>window.chartHarness.writes);
 await primary.getByRole('combobox',{name:'显示指标'}).selectOption('元');
 await page.waitForFunction(()=>[...document.querySelectorAll('.iui-chart-metric select')].every(select=>select.value==='元'));
 assert.equal(await page.evaluate(()=>window.chartHarness.writes),beforeShared+1,'paired views project the same unit with no render-time writes');
 assert.equal(await primary.locator('svg [data-chart-row="0"]').first().getAttribute('aria-pressed'),'true');
 assert.equal(await secondary.locator('svg [data-chart-row="1"]').first().getAttribute('aria-pressed'),'true');
 assert.equal((await state(page)).selectedIdentity,durable.selectedIdentity);assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);
});

test('invalid saved units are projected locally, unknown units group together, and disabled unit controls never write',async t=>{
 const page=await mount(t);await page.evaluate(({rows,series})=>{window.chartHarness.setRows(rows);window.chartHarness.setSeries(series);window.chartHarness.setType('bar');},{rows:unitData,series:unitSeries});
 const metric=page.getByRole('combobox',{name:'显示指标'});await page.waitForFunction(()=>document.querySelector('.iui-chart-metric select')?.value==='元');
 const invalid={unit:'removed-unit',hidden:['sales','profit'],selected:null};await page.evaluate(record=>window.chartHarness.setBound(record),invalid);
 await page.waitForFunction(()=>document.querySelectorAll('svg [data-chart-row]').length===0);
 const before=await page.evaluate(()=>window.chartHarness.writes);assert.equal(await metric.inputValue(),'元','first authored group wins even if all of its series are hidden');assert.deepEqual(await state(page),invalid);
 await page.evaluate(()=>window.chartHarness.setSeries([{key:'capacity',label:'容量',unit:'GB'}]));
 await page.waitForFunction(()=>document.querySelectorAll('svg [data-chart-row]').length===3);
 assert.equal(await page.getByRole('combobox',{name:'显示指标'}).count(),0,'a single group needs no switching control');assert.deepEqual(await state(page),invalid);
 await page.evaluate(()=>{window.chartHarness.setSeries([{key:'sales',label:'销售额（元）'},{key:'profit',label:'利润',unit:''},{key:'capacity',label:'容量',unit:'GB'}]);window.chartHarness.setBound({unit:'removed-unit',hidden:[],selected:null});});
 await metric.waitFor();assert.equal(await metric.inputValue(),'','missing and empty explicit units share the first group');
 assert.equal(await page.locator('svg [data-chart-row]').count(),6);assert.equal(await page.locator('svg [data-chart-series="capacity"]').count(),0,'a unit in a label is not inferred as metadata');
 assert.match(await metric.locator('option').first().textContent(),/未标注单位/);assert.equal(await page.evaluate(()=>window.chartHarness.writes),before,'series/state restoration causes no automatic repair writes');
 await page.evaluate(()=>window.chartHarness.setDisabled(true));await page.waitForFunction(()=>document.querySelector('.iui-chart-metric select')?.disabled);const locked=await state(page);assert.equal(await metric.isDisabled(),true);
 assert.equal(await page.locator('.iui-chart-legend-item').first().isDisabled(),true);
 await metric.evaluate(select=>{select.value='GB';select.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('.iui-chart-legend-item').first().dispatchEvent('click');await page.locator('svg [data-chart-row="0"]').first().dispatchEvent('click');
 assert.deepEqual(await state(page),locked);assert.equal(await page.evaluate(()=>window.chartHarness.writes),before,'disabled native and SVG controls cannot update binding');
 await page.evaluate(()=>{window.chartHarness.setDisabled(false);window.chartHarness.setSeries(['sales','profit']);window.chartHarness.setBound({unit:'GB',hidden:[],selected:null});});
 await page.waitForFunction(()=>!document.querySelector('.iui-chart-metric select'));
 assert.equal(await page.locator('svg [data-chart-row]').count(),6,'legacy unitless charts keep their simultaneous series presentation');
 assert.deepEqual(await page.locator('.iui-chart-legend-item').allTextContents(),['sales','profit']);assert.equal((await state(page)).unit,'GB');
 assert.equal(await page.evaluate(()=>window.chartHarness.writes),before);assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);
});

test('pie keeps per-metric selection and legacy hidden restoration while exposing explicit units once',async t=>{
 const page=await mount(t);await page.evaluate(()=>{window.chartHarness.setSeries([{key:'sales',label:'销售额（元）',unit:'元'},{key:'profit',label:'利润',unit:'GB'}]);window.chartHarness.setBound({unit:'元',hidden:['sales'],selected:null});});
 const metric=page.getByRole('combobox',{name:'显示指标'});await page.waitForFunction(()=>document.querySelector('.iui-chart-metric select')?.value==='profit');
 assert.deepEqual(await metric.locator('option').allTextContents(),['销售额（元）','利润（GB）']);
 assert.match(await page.locator('svg [data-chart-row="1"]').getAttribute('aria-label'),/利润（GB）：30.*30%/);
 assert.match(await page.locator('.iui-chart-legend-item').nth(1).textContent(),/30 GB.*30%/);
 await page.locator('svg [data-chart-row="1"]').focus();await page.keyboard.press('Enter');const chosen=await state(page);
 await metric.selectOption('sales');assert.equal((await state(page)).metric,'sales');assert.equal((await state(page)).unit,'元','pie does not replace its existing unit state');
 assert.equal((await state(page)).selectedIdentity,chosen.selectedIdentity);assert.deepEqual((await state(page)).hidden,[]);
 assert.match(await page.locator('.iui-chart-description').textContent(),/乙.*销售额（元）：60.*60%/);
 assert.match(await page.locator('.iui-chart-legend-item').nth(1).textContent(),/60 元.*60%/);
 await page.locator('.iui-chart-legend-item').nth(1).click();assert.equal((await state(page)).selected,null);assert.equal(await page.locator('svg [data-chart-row="1"]').count(),0);
 await page.evaluate(()=>window.chartHarness.setBound({unit:'GB',hidden:['sales','profit'],selected:null}));
 await page.waitForFunction(()=>document.querySelector('.iui-chart-metric select')?.value==='');await metric.selectOption('profit');
 assert.equal(await page.locator('svg [data-chart-row]').count(),3,'unit metadata does not break legacy hidden metric recovery');
 await page.getByText('查看数据',{exact:true}).click();assert.deepEqual(await page.locator('.iui-chart-data thead th').allTextContents(),['category','销售额（元）','利润（GB）']);
 assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);
});

test('Chart appends optional category controls without changing the original six arguments',()=>{
 const original=`root = Chart("bar",${JSON.stringify(data)},"category",${JSON.stringify(unitSeries)},"比较","chart")`;
 const legacy=evaluateDocument(compile(original)).props;
 assert.equal(legacy.categoryFilters,false);assert.equal(legacy.colorBy,'series');
 const upgraded=evaluateDocument(compile(original.replace(/\)$/,',true,"category")'))).props;
 assert.equal(upgraded.categoryFilters,true);assert.equal(upgraded.colorBy,'category');
 assert.deepEqual(upgraded.data,legacy.data);assert.deepEqual(upgraded.series,legacy.series);
 assert.throws(()=>evaluateDocument(compile(original.replace(/\)$/,',"yes","category")'))));
 assert.throws(()=>evaluateDocument(compile(original.replace(/\)$/,',true,"unknown")'))));
});

test('non-pie category filters change marks, paths, hit targets and axes while preserving complete raw data',async t=>{
 const page=await mount(t);
 await page.evaluate(({rows,series})=>{window.chartHarness.setRows(rows);window.chartHarness.setSeries(series);window.chartHarness.setCategoryFilters(true);},{rows:unitData,series:unitSeries});
 for(const type of ['bar','line','area','scatter']){
  await page.evaluate(type=>{window.chartHarness.setType(type);window.chartHarness.setBound({hidden:['profit'],selected:null});},type);
  await page.waitForFunction(type=>window.chartHarness.type===type&&document.querySelectorAll('svg [data-chart-row]').length===3,type);
  const categories=page.locator('.iui-chart-category-list'),name=index=>type==='scatter'?String(index+1):['甲','乙','丙'][index];
  assert.equal(await categories.getByRole('button').count(),3);
  await page.locator('svg [data-chart-row="0"]').focus();await page.keyboard.press('Enter');const selected=await state(page);
  await categories.getByRole('button',{name:name(1),exact:true}).click();
  assert.equal(await page.locator('svg [data-chart-row]').count(),2,`${type}: hidden rows have no marks or hit targets`);
  assert.equal(await page.locator('svg [data-chart-row="1"]').count(),0);
  assert.deepEqual((await state(page)).hidden,['profit']);assert.equal((await state(page)).selectedIdentity,selected.selectedIdentity);
  assert.equal((await state(page)).selected,0,'filtering another category does not rewrite selection');
  const labels=await page.locator('.iui-chart-canvas svg text').allTextContents();
  assert.ok(labels.includes('30'),`${type}: scale is recomputed from visible raw values`);
  assert.ok(!labels.includes('60'));assert.ok(!labels.includes(name(1)),`${type}: hidden categories have no axis labels`);
  if(type==='bar')assert.equal(Number(await page.locator('svg [data-chart-row="0"] rect').first().getAttribute('height')),252,'30 uses the visible maximum 30 without conversion');
  if(type==='line'||type==='area'){
   assert.equal((await page.locator('svg polyline').getAttribute('points')).split(' ').length,2,'the line connects only visible rows');
   if(type==='area')assert.equal((await page.locator('svg polygon').getAttribute('points')).split(' ').length,4,'the area uses visible first and last rows');
  }
  await page.getByRole('combobox',{name:'显示指标'}).selectOption('GB');
  assert.equal((await state(page)).unit,'GB');assert.deepEqual((await state(page)).hidden,['profit']);
  assert.equal(await page.locator('svg [data-chart-series="capacity"]').count(),2,'category visibility also applies after a unit switch');
  assert.match(await page.locator('svg [data-chart-row="0"]').getAttribute('aria-label'),/容量（GB）：100/);
  await page.getByText('查看数据',{exact:true}).click();
  assert.equal(await page.locator('.iui-chart-data tbody tr').count(),3);
  assert.deepEqual(await page.locator('.iui-chart-data tbody tr').nth(1).locator('td').allTextContents(),['60','30','500'],'hidden raw rows and all units remain unchanged');
  await page.getByText('查看数据',{exact:true}).click();
  await categories.getByRole('button',{name:name(0),exact:true}).click();
  assert.equal((await state(page)).selected,null);assert.equal((await state(page)).selectedIdentity,null,'hiding the selected category clears its evidence');
  await categories.getByRole('button',{name:name(2),exact:true}).click();
  assert.equal(await page.locator('svg [data-chart-row]').count(),0);
  assert.deepEqual(await page.locator('.iui-chart-canvas svg text').allTextContents(),['请开启至少一个数据分类']);
  assert.match(await page.locator('.iui-chart-category-count').textContent(),/0\/3/);
  assert.match(await page.locator('.iui-chart-description').textContent(),/请开启至少一个数据分类/);
  if(type==='line'||type==='area')assert.equal(await page.locator('svg polyline,svg polygon').count(),0);
 }
 assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);await capture(page,'category-filter-all-hidden');
});

test('typed category filters retain independent units, hidden series and row identities across reordered shared views',async t=>{
 const page=await mount(t);
 const rows=[{id:'number',category:1,sales:10,profit:20,capacity:100},{id:'string',category:'1',sales:20,profit:30,capacity:200},{id:'a',category:'重复',sales:30,profit:40,capacity:300},{id:'b',category:'重复',sales:40,profit:50,capacity:400}];
 await page.evaluate(({rows,series})=>{window.chartHarness.setRows(rows);window.chartHarness.setSeries(series);window.chartHarness.setType('bar');window.chartHarness.setCategoryFilters(true);window.chartHarness.setColorBy('category');window.chartHarness.setBound({unit:'GB',hidden:['profit'],selected:null});},{rows,series:unitSeries});
 await page.waitForFunction(()=>document.querySelectorAll('.iui-chart-category-item').length===3);
 await page.locator('svg [data-chart-row="2"]').focus();await page.keyboard.press('Enter');const chosen=await state(page);
 const repeated=page.locator('.iui-chart-category-list').getByRole('button',{name:'重复',exact:true});
 const repeatedColor=await repeated.locator('span').evaluate(el=>getComputedStyle(el).backgroundColor);
 await page.locator('.iui-chart-category-item').nth(0).click();
 const filtered=await state(page);assert.deepEqual(filtered,{...chosen,hiddenCategories:['category:'+JSON.stringify(['number',1])]});
 assert.equal(await page.locator('svg [data-chart-row="0"]').count(),0);assert.equal(await page.locator('svg [data-chart-row="1"]').count(),1,'string 1 remains a different group');
 await page.getByRole('combobox',{name:'显示指标'}).selectOption('元');
 assert.equal((await state(page)).unit,'元');assert.deepEqual((await state(page)).hidden,['profit']);
 assert.equal(await page.locator('svg [data-chart-series="profit"]').count(),0);assert.equal(await page.locator('svg [data-chart-row="2"]').getAttribute('aria-pressed'),'true');
 const writes=await page.evaluate(()=>window.chartHarness.writes);await page.evaluate(()=>window.chartHarness.setRows([...window.chartHarness.rows].reverse()));
 await page.waitForFunction(()=>document.querySelector('svg [data-chart-row="1"]')?.getAttribute('aria-pressed')==='true');
 assert.equal(await repeated.locator('span').evaluate(el=>getComputedStyle(el).backgroundColor),repeatedColor,'a row reorder does not recolor the group');
 assert.equal(await page.evaluate(()=>window.chartHarness.writes),writes,'restoration and reordering never write state');
 await page.evaluate(()=>window.chartHarness.setPaired(true));await page.locator('.iui-chart').nth(1).waitFor();
 const primary=page.locator('.iui-chart').first(),secondary=page.locator('.iui-chart').nth(1);
 assert.deepEqual(await primary.locator('.iui-chart-category-item').evaluateAll(items=>items.map(item=>item.getAttribute('aria-pressed'))),['true','true','false']);
 assert.deepEqual(await secondary.locator('.iui-chart-category-item').evaluateAll(items=>items.map(item=>item.getAttribute('aria-pressed'))),['false','true','true']);
 assert.equal(await secondary.locator('svg [data-chart-row="2"]').getAttribute('aria-pressed'),'true');
 assert.equal(await secondary.locator('.iui-chart-category-list').getByRole('button',{name:'重复',exact:true}).locator('span').evaluate(el=>getComputedStyle(el).backgroundColor),repeatedColor);
 const before=await page.evaluate(()=>window.chartHarness.writes);await primary.locator('.iui-chart-category-list').getByRole('button',{name:'重复',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.chartHarness.writes),before+1,'one gesture updates both views once');
 assert.equal((await state(page)).selected,null);assert.equal((await state(page)).selectedIdentity,null);
 assert.deepEqual((await state(page)).hiddenCategories,['category:'+JSON.stringify(['number',1]),'category:'+JSON.stringify(['string','重复'])]);
 assert.equal(await primary.locator('svg [data-chart-row]').count(),1);assert.equal(await secondary.locator('svg [data-chart-row]').count(),1,'every row in a repeated typed category is hidden');
 assert.equal((await state(page)).unit,'元');assert.deepEqual((await state(page)).hidden,['profit']);assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);
});

test('category color controls agree with all chart marks and line or area gradients',async t=>{
 const page=await mount(t);await page.evaluate(()=>{window.chartHarness.setCategoryFilters(true);window.chartHarness.setColorBy('category');window.chartHarness.setXField('category');});
 for(const type of ['bar','line','area','scatter','pie']){
  await page.evaluate(type=>window.chartHarness.setType(type),type);await page.waitForFunction(type=>window.chartHarness.type===type,type);
  const controls=page.locator('.iui-chart-category-item'),swatches=[];
  for(let index=0;index<3;index++){
   const color=await controls.nth(index).locator('span').evaluate(el=>getComputedStyle(el).backgroundColor);swatches.push(color);
   const marks=page.locator(`svg [data-chart-row="${index}"]`);
   for(const mark of await marks.all()){
    const colored=type==='pie'?mark:mark.locator(type==='bar'?'rect':'circle').first();
    assert.equal(await colored.evaluate(el=>getComputedStyle(el).fill),color,`${type}: controls and marks share the category color`);
   }
  }
  assert.equal(new Set(swatches).size,3,'three categories are distinct within the six-color palette');
  if(type==='line'||type==='area'){
   assert.deepEqual(await page.locator('svg stop').evaluateAll(stops=>stops.map(stop=>getComputedStyle(stop).stopColor)),swatches,'the path has the same category colors at each point');
   assert.deepEqual(await page.locator('svg stop').evaluateAll(stops=>stops.map(stop=>stop.getAttribute('offset'))),['0','0.5','1']);
   assert.match(await page.locator('svg polyline').first().getAttribute('stroke'),/^url\(#/);
   if(type==='area')assert.match(await page.locator('svg polygon').first().getAttribute('fill'),/^url\(#/);
  }
  const colorsBefore=[...swatches];await controls.nth(1).click();
  assert.deepEqual(await controls.locator('span').evaluateAll(spans=>spans.map(span=>getComputedStyle(span).backgroundColor)),colorsBefore,'explicit hiding does not recolor remaining categories');
  await controls.nth(1).click();
 }
 assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);await capture(page,'category-colors-pie');
});

test('category controls are bounded, collapsible and disabled, while default charts retain series behavior',async t=>{
 const page=await mount(t,{viewport:{width:320,height:844},hasTouch:true,isMobile:true});
 const rows=Array.from({length:80},(_,index)=>({category:`第${index}类：一段足够长的分类名称用于窄屏检查`,sales:index+1,profit:1}));
 await page.evaluate(rows=>{window.chartHarness.setRows(rows);window.chartHarness.setType('bar');window.chartHarness.setCategoryFilters(true);},rows);
 await page.waitForFunction(()=>document.querySelectorAll('.iui-chart-category-item').length===80);
 const list=page.locator('.iui-chart-category-list'),summary=page.locator('.iui-chart-categories summary'),before=await page.evaluate(()=>window.chartHarness.writes);
 const bounds=await list.evaluate(el=>({height:el.getBoundingClientRect().height,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));
 assert.ok(bounds.height<=182);assert.ok(bounds.scrollHeight>bounds.height);assert.equal(bounds.overflow,'auto');
 await summary.click();assert.equal(await list.isVisible(),false);assert.equal(await page.evaluate(()=>window.chartHarness.writes),before,'collapsing only changes local presentation');
 await summary.click();assert.equal(await list.isVisible(),true);
 await page.locator('.iui-chart-category-item').nth(79).focus();await page.keyboard.press('Space');
 assert.equal(await page.locator('svg [data-chart-row="79"]').count(),0);assert.equal(await page.evaluate(()=>window.chartHarness.writes),before+1);
 await page.evaluate(()=>window.chartHarness.setDisabled(true));await page.waitForFunction(()=>document.querySelector('.iui-chart-category-item')?.disabled);
 const locked=await state(page);assert.equal(await page.locator('.iui-chart-category-item').first().isDisabled(),true);
 await page.locator('.iui-chart-category-item').first().dispatchEvent('click');assert.deepEqual(await state(page),locked);assert.equal(await page.evaluate(()=>window.chartHarness.writes),before+1);
 await page.evaluate(()=>{window.chartHarness.setDisabled(false);window.chartHarness.setCategoryFilters(false);});
 await page.waitForFunction(()=>!document.querySelector('.iui-chart-categories'));
 assert.equal(await page.locator('svg [data-chart-row]').count(),160,'legacy non-pie sources do not apply hidden category state');
 assert.deepEqual(await page.locator('.iui-chart-legend-item').allTextContents(),['销售额','利润']);
 assert.equal(await page.locator('svg [data-chart-row="0"][data-chart-series="sales"] rect').first().getAttribute('fill'),'#0285ff');
 assert.equal(await page.locator('svg [data-chart-row="0"][data-chart-series="profit"] rect').first().getAttribute('fill'),'#008635');
 assert.deepEqual(await state(page),locked,'changing props does not repair or discard stored filters');assert.equal(await page.evaluate(()=>window.chartHarness.writes),before+1);
 assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);await capture(page,'category-default-series-320');
});

test('responsive chart geometry keeps 320px axes legible, labels bounded and zoom hits local',async t=>{
 const page=await mount(t,{viewport:{width:320,height:950},hasTouch:true,isMobile:true});
 const rows=unitData.map((row,index)=>({...row,category:['轻量套餐：适合日常使用','标准套餐：面向团队协作','专业套餐：用于大型项目'][index]}));
 await page.evaluate(({rows,series})=>{window.chartHarness.setRows(rows);window.chartHarness.setSeries(series);window.chartHarness.setType('bar');window.chartHarness.setCategoryFilters(true);window.chartHarness.setColorBy('category');},{rows,series:unitSeries});
 const svg=page.locator('.iui-chart-canvas svg');
 await page.waitForFunction(()=>document.querySelector('.iui-chart-canvas svg')?.viewBox.baseVal.width<=320);
 const checkGeometry=async()=>{
  const bounds=await svg.evaluate(element=>({width:element.viewBox.baseVal.width,rendered:element.getBoundingClientRect().width,height:element.viewBox.baseVal.height,labels:[...element.querySelectorAll('.iui-chart-label')].map(label=>{const box=label.getBBox(),m=label.getScreenCTM();return{text:label.textContent,font:parseFloat(getComputedStyle(label).fontSize)*Math.hypot(m.a,m.b),left:box.x,right:box.x+box.width};})}));
  assert.ok(Math.abs(bounds.width-bounds.rendered)<=1,'fitted chart recomputes coordinates at its rendered width');assert.equal(bounds.height,240);
  for(const label of bounds.labels){assert.ok(label.font>=11.5,`${label.text}: axis font remains approximately 12px`);assert.ok(label.left>=-1&&label.right<=bounds.width+1,`${label.text}: label stays inside the canvas`);}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);return bounds;
 };
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>theme==='dark'?document.body.setAttribute('data-ds-dark-theme',''):document.body.removeAttribute('data-ds-dark-theme'),theme);
  await checkGeometry();const labels=await svg.locator('[data-chart-axis="x"]').all();assert.equal(labels.length,3);
  for(const label of labels)assert.match(await label.textContent(),/…/);
  await capture(page,`responsive-bar-${theme}-320`);
 }
 const axisTitles=await svg.locator('[data-chart-axis="x"] title').allTextContents();assert.deepEqual(axisTitles,rows.map(row=>row.category));
 await page.getByRole('combobox',{name:'显示指标'}).selectOption('GB');await page.locator('.iui-chart-category-item').nth(1).tap();await checkGeometry();
 assert.equal((await state(page)).unit,'GB');assert.equal(await svg.locator('[data-chart-row]').count(),2);assert.match(await svg.locator('[data-chart-row="2"]').getAttribute('aria-label'),/容量（GB）：2,000/);
 await page.getByText('查看数据',{exact:true}).click();assert.deepEqual(await page.locator('.iui-chart-data .iui-data-select').allTextContents(),rows.map(row=>row.category));await page.getByText('查看数据',{exact:true}).click();
 const before=await state(page),writes=await page.evaluate(()=>window.chartHarness.writes);await svg.evaluate(element=>window.responsiveChartSVG=element);
 await page.getByRole('button',{name:'放大图形',exact:true}).tap();await page.waitForFunction(()=>document.querySelector('.iui-chart-canvas svg')?.viewBox.baseVal.width===640);
 assert.equal(await svg.evaluate(element=>element===window.responsiveChartSVG),true,'zoom keeps the SVG node mounted');assert.deepEqual(await state(page),before);assert.equal(await page.evaluate(()=>window.chartHarness.writes),writes);
 await svg.locator('[data-chart-row="2"]').tap();assert.equal((await state(page)).selected,2,'original-size transformed bar hit selects its authored row');
 await page.getByRole('button',{name:'适应宽度',exact:true}).tap();await page.waitForFunction(()=>document.querySelector('.iui-chart-canvas svg')?.viewBox.baseVal.width<320);await checkGeometry();assert.equal((await state(page)).selected,2);
 const afterSelection=await state(page),afterWrites=await page.evaluate(()=>window.chartHarness.writes);
 await page.setViewportSize({width:900,height:950});await page.waitForFunction(()=>document.querySelector('.iui-chart-canvas svg')?.viewBox.baseVal.width===640);assert.equal(await svg.evaluate(element=>element.viewBox.baseVal.height),320);
 await page.setViewportSize({width:320,height:950});await page.waitForFunction(()=>document.querySelector('.iui-chart-canvas svg')?.viewBox.baseVal.width<320);await checkGeometry();assert.deepEqual(await state(page),afterSelection);assert.equal(await page.evaluate(()=>window.chartHarness.writes),afterWrites,'resizing never persists chart state');
 await page.locator('.iui-chart-category-item').nth(1).tap();
 for(const type of ['line','area','scatter','pie']){
  await page.evaluate(type=>window.chartHarness.setType(type),type);await checkGeometry();
  const mark=svg.locator('[data-chart-row="1"]').first();await mark.tap();assert.equal((await state(page)).selected,1,`${type}: fitted transformed mark hit`);await page.getByRole('button',{name:'取消选择',exact:true}).tap();
 }
 await capture(page,'responsive-pie-dark-320');
 const dense=Array.from({length:30},(_value,index)=>({category:`第${index}项很长的分类名称 WWWWWW`,sales:123456789012+index,profit:1,capacity:100}));
 await page.evaluate(rows=>{window.chartHarness.setRows(rows);window.chartHarness.setType('line');},dense);await page.getByRole('combobox',{name:'显示指标'}).selectOption('元');await checkGeometry();
 const denseLabels=await svg.locator('[data-chart-axis="x"]').evaluateAll(labels=>labels.map(label=>{const box=label.getBBox();return{left:box.x,right:box.x+box.width,title:label.querySelector('title').textContent};}));
 assert.ok(denseLabels.length<=4);assert.equal(denseLabels[0].title,dense[0].category);assert.equal(denseLabels.at(-1).title,dense.at(-1).category);
 for(let index=1;index<denseLabels.length;index++)assert.ok(denseLabels[index].left>=denseLabels[index-1].right,'dense labels do not overlap');
 await capture(page,'responsive-dense-large-values-dark-320');assert.equal(await page.evaluate(()=>window.chartHarness.actions),0);
});
