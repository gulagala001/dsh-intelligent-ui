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
const bundle = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Chart} from './src/client/components/data.jsx';
function App(){
 const [state,setState]=useState({chart:{hidden:[],selected:null}}),[type,setType]=useState('pie'),[disabled,setDisabled]=useState(false),[paired,setPaired]=useState(false),[rows,setRows]=useState(${JSON.stringify(data)}),[series,setSeries]=useState([{key:'sales',label:'销售额'},{key:'profit',label:'利润'}]);
 window.chartHarness={state,rows,setRows,setPaired,setType,setDisabled,setSeries,setBound:value=>setState({chart:value}),actions:window.chartHarness?.actions||0,writes:window.chartHarness?.writes||0};
 const api={state,disabled,set:(name,value)=>{window.chartHarness.writes++;setState(old=>({...old,[name]:value}));},action:()=>window.chartHarness.actions++};
 return <div className="iui-surface" style={{maxWidth:720,padding:16}}><Chart api={api} props={{type,title:'分类业绩',x:type==='scatter'?'position':'category',data:rows,series,bind:'chart'}}/>{paired&&<Chart api={api} props={{type,title:'共享视图',x:'category',data:[...rows].reverse(),series,bind:'chart'}}/>}</div>;
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
