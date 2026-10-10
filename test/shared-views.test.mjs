import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {validateState} from '../src/host/storage.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const css=await readFile(join(root,'src/client/styles/surface.css'),'utf8');
async function fixture(t,source){
  let record={revision:0,componentsVersion:2,sourceRevision:createHash('sha256').update(source).digest('hex'),state:{}};
  const contents=`import React from 'react';import {createRoot} from 'react-dom/client';import {IntelligentSurface} from './src/client/Surface.jsx';import {acquireDocument,disposeDocuments} from './src/client/document-store.mjs';const source=${JSON.stringify(source)},lease=acquireDocument('shared-view','1:1:0:0');window.shared={store:lease.store,dispose:disposeDocuments};function App(){const [source,setSource]=React.useState(${JSON.stringify(source)});window.shared.replaceSource=setSource;const [expanded,setExpanded]=React.useState(false);return <div style={{display:'flex',gap:24}}><div style={{width:540}}><IntelligentSurface source={source} sessionId="shared-view" blockId="1:1:0:0" onExpand={()=>setExpanded(true)}/></div>{expanded&&<div style={{width:540}}><IntelligentSurface source={source} sessionId="shared-view" blockId="1:1:0:0" expanded/><button onClick={()=>setExpanded(false)}>收回作品</button></div>}</div>}createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle=await build({stdin:{contents,resolveDir:root,loader:'jsx'},bundle:true,format:'iife',platform:'browser',write:false});
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:850},hasTouch:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://127.0.0.1:9191/**',async route=>{
    if(new URL(route.request().url()).pathname.includes('/intelligent-ui/api/state')){
      if(route.request().method()==='POST'){const input=route.request().postDataJSON();validateState(input.state);record={...input,revision:record.revision+1};}
      return route.fulfill({contentType:'application/json',body:JSON.stringify(record)});
    }
    return route.fulfill({body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
  });
  const open=async()=>{await page.goto('http://127.0.0.1:9191/');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});await page.locator('.iui-surface [role="status"]').filter({hasText:'已保存'}).waitFor();};
  await open();return {page,open,errors,record:()=>record,replace:async source=>{record={revision:0,componentsVersion:2,sourceRevision:createHash('sha256').update(source).digest('hex'),state:{}};await page.evaluate(source=>window.shared.replaceSource(source),source);await page.locator('.iui-surface [role="status"]').filter({hasText:'已保存'}).first().waitFor();}};
}
test('implicit chart filtering and table sorting survive expand, collapse and browser reload',async t=>{
  const source='root = Stack([Chart("line",[{month:"一月",a:2,b:8},{month:"二月",a:7,b:3}],"month",[{key:"a",label:"甲"},{key:"b",label:"乙"}],"双系列"),Table([{key:"value",label:"数值"}],[{value:2},{value:9}],"排序数据")])';
  const f=await fixture(t,source),{page}=f;
  await page.getByRole('button',{name:'甲',exact:true}).click();
  await page.getByRole('button',{name:'数值',exact:true}).click();await page.getByRole('button',{name:'数值',exact:true}).click();
  await page.waitForFunction(()=>Object.keys(window.shared.store.state).filter(key=>key.startsWith('@iui-widget:')).length===2);
  await page.getByRole('button',{name:'展开交互内容'}).click();
  assert.deepEqual(await page.getByRole('button',{name:'甲',exact:true}).evaluateAll(elements=>elements.map(element=>element.getAttribute('aria-pressed'))),['false','false']);
  assert.equal(await page.locator('th[aria-sort="descending"]').count(),2);
  assert.equal(await page.locator('table').filter({has:page.locator('caption',{hasText:'排序数据'})}).first().locator('tbody tr').first().innerText(),'9');
  await page.getByRole('button',{name:'收回作品'}).click();
  await page.waitForFunction(()=>window.shared.store.snapshot.status==='saved');
  assert.equal(Object.keys(f.record().state).filter(key=>key.startsWith('@iui-widget:')).length,2);
  await f.open();
  assert.equal(await page.getByRole('button',{name:'甲',exact:true}).getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('th[aria-sort="descending"]').count(),1);
  assert.equal(await page.locator('table').filter({has:page.locator('caption',{hasText:'排序数据'})}).first().locator('tbody tr').first().innerText(),'9');
  assert.deepEqual(f.errors,[]);
});
test('one scene clock and playback state are shared across inline and expanded views',async t=>{
  const scene={initial:{t:0,keys:0,clicks:0},events:{tick:[{name:'t',value:'t + event.dt'}],key:[{name:'keys',value:'event.key == "Enter" ? keys + 1 : keys'}],click:[{name:'clicks',value:'clicks + 1'}]},marks:[{id:'target',type:'circle',x:100,y:60,r:20,interactive:true,label:'键盘目标'},{id:'time',type:'text',x:10,y:20,text:{expr:'concat("时间：", round(t, 2))'}}],width:240,height:120};
  const f=await fixture(t,`root = Scene(${JSON.stringify(scene)},"motion","共享场景")`),{page}=f;
  await page.getByRole('button',{name:'展开交互内容'}).click();
  await page.getByRole('button',{name:'播放',exact:true}).first().click();
  await page.getByRole('button',{name:'暂停',exact:true}).nth(1).waitFor();
  await page.waitForFunction(()=>window.shared.store.state.motion.values.t>=0.3);
  await page.getByRole('button',{name:'暂停',exact:true}).nth(1).click();
  assert.equal(await page.getByRole('button',{name:'播放',exact:true}).count(),2,'pausing either view stops the one shared player');
  const stopped=await page.evaluate(()=>window.shared.store.state.motion.values.t);
  await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.shared.store.state.motion.values.t),stopped);
  const target=page.getByRole('button',{name:'键盘目标'}).first();await target.focus();await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>({keys:window.shared.store.state.motion.values.keys,clicks:window.shared.store.state.motion.values.clicks})),{keys:1,clicks:0},'a defined key event wins over simulated button click');
  await page.getByRole('button',{name:'播放',exact:true}).nth(1).click();
  await page.getByRole('button',{name:'收回作品'}).click();
  assert.equal(await page.getByRole('button',{name:'暂停',exact:true}).count(),1,'closing one view retains playback in the remaining visible view');
  await page.getByRole('button',{name:'重置',exact:true}).click();assert.equal(await page.getByRole('button',{name:'播放',exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>window.shared.store.state.motion.values.t),0);
  await page.getByRole('button',{name:'播放',exact:true}).click();
  await page.evaluate(()=>window.shared.store.update('root = Text("新的作品")',false));
  assert.equal(await page.evaluate(()=>window.shared.store.playback.players.size),0,'changing source retires all old clocks');
  assert.deepEqual(f.errors,[]);
});
test('Unicode object keys render and conditional charts retain independent restored settings',async t=>{
  const source='$alternate = false\nwidgets = {"中文":Table(["值"],[[2],[9]],"中文表"),"a/b":Table(["值"],[[3],[8]],"斜线表")}\nroot = Stack([widgets["中文"],widgets["a/b"],Checkbox("另一图","alternate",false),$alternate ? Chart("bar",[{name:"乙",value:4}],"name",[{key:"value",label:"指标"}],"图乙") : Chart("bar",[{name:"甲",value:7}],"name",[{key:"value",label:"指标"}],"图甲")])';
  const f=await fixture(t,source),{page}=f;
  assert.equal(await page.locator('.iui-error').count(),0);
  const chinese=page.locator('table').filter({has:page.locator('caption',{hasText:'中文表'})});
  const slash=page.locator('table').filter({has:page.locator('caption',{hasText:'斜线表'})});
  await chinese.getByRole('button',{name:'值',exact:true}).click();await chinese.getByRole('button',{name:'值',exact:true}).click();
  assert.equal(await chinese.locator('th').getAttribute('aria-sort'),'descending');
  assert.equal(await slash.locator('th').getAttribute('aria-sort'),'none');
  await page.getByRole('button',{name:'指标',exact:true}).click();
  await page.getByRole('checkbox',{name:'另一图'}).check();
  assert.equal(await page.getByRole('button',{name:'指标',exact:true}).getAttribute('aria-pressed'),'true','a different conditional branch starts with its own setting');
  await page.getByRole('checkbox',{name:'另一图'}).uncheck();
  assert.equal(await page.getByRole('button',{name:'指标',exact:true}).getAttribute('aria-pressed'),'false','returning to the first branch restores its setting');
  await page.waitForFunction(()=>window.shared.store.snapshot.status==='saved');
  await f.open();
  assert.equal(await page.getByRole('button',{name:'指标',exact:true}).getAttribute('aria-pressed'),'false');
  assert.equal(await chinese.locator('th').getAttribute('aria-sort'),'descending');
  await page.getByRole('checkbox',{name:'另一图'}).check();
  assert.equal(await page.getByRole('button',{name:'指标',exact:true}).getAttribute('aria-pressed'),'true');
  assert.deepEqual(f.errors,[]);
});
test('filtering a dynamic collection never transfers a removed table setting to its neighbor',async t=>{
  const source='$hide = false\nitems = [{id:"A",rows:[[1],[2]]},{id:"B",rows:[[3],[4]]}]\nroot = Stack([Checkbox("隐藏甲","hide",false),Stack(each(filter(items,item,!$hide || item.id != "A"),item,Table(["值"],item.rows,item.id)))])';
  const f=await fixture(t,source),{page}=f;
  const table=name=>page.locator('table').filter({has:page.locator('caption',{hasText:new RegExp('^'+name+'$')})});
  await table('A').getByRole('button',{name:'值',exact:true}).click();await table('A').getByRole('button',{name:'值',exact:true}).click();
  await page.getByRole('checkbox',{name:'隐藏甲'}).check();
  assert.equal(await table('A').count(),0);assert.equal(await table('B').locator('th').getAttribute('aria-sort'),'none','B keeps its own default after A is removed');
  await table('B').getByRole('button',{name:'值',exact:true}).click();await table('B').getByRole('button',{name:'值',exact:true}).click();
  await page.getByRole('checkbox',{name:'隐藏甲'}).uncheck();
  assert.equal(await table('A').locator('tbody tr').first().innerText(),'2');assert.equal(await table('B').locator('tbody tr').first().innerText(),'4');
  await page.waitForFunction(()=>window.shared.store.snapshot.status==='saved');await f.open();
  assert.equal(await table('A').locator('tbody tr').first().innerText(),'2');assert.equal(await table('B').locator('tbody tr').first().innerText(),'4');
  await page.getByRole('checkbox',{name:'隐藏甲'}).check();assert.equal(await table('B').locator('tbody tr').first().innerText(),'4');
  assert.deepEqual(f.errors,[]);
});
test('filtered duplicate IDs retain distinct table state and deep paths fit the native storage contract',async t=>{
  const source='$mode = "A"\nitems = [{id:"duplicate",name:"A",rows:[[1],[2]]},{id:"duplicate",name:"B",rows:[[3],[4]]}]\nroot = Stack([Select("显示项目","mode",["A","B","全部"],"A"),Stack(each(filter(items,item,$mode == "全部" || item.name == $mode),item,Stack(each([1],a,Stack(each([1],b,Stack(each([1],c,Table(["值"],item.rows,item.name)))))))))])';
  const f=await fixture(t,source),{page}=f;
  const table=name=>page.locator('table').filter({has:page.locator('caption',{hasText:new RegExp('^'+name+'$')})});
  await table('A').getByRole('button',{name:'值',exact:true}).click();await table('A').getByRole('button',{name:'值',exact:true}).click();
  await page.getByLabel('显示项目',{exact:true}).selectOption('全部');
  assert.equal(await table('A').locator('th').getAttribute('aria-sort'),'descending');assert.equal(await table('B').locator('th').getAttribute('aria-sort'),'none');
  await page.getByLabel('显示项目',{exact:true}).selectOption('B');assert.equal(await table('B').locator('th').getAttribute('aria-sort'),'none');
  await table('B').getByRole('button',{name:'值',exact:true}).click();
  await page.waitForFunction(()=>window.shared.store.snapshot.status==='saved');
  assert.ok(Object.keys(f.record().state).every(key=>key.length<=256));
  await f.open();assert.equal(await table('B').locator('th').getAttribute('aria-sort'),'ascending');
  await page.getByLabel('显示项目',{exact:true}).selectOption('A');assert.equal(await table('A').locator('th').getAttribute('aria-sort'),'descending');
  assert.deepEqual(f.errors,[]);
});
test('drag works across shared views, touch, cancellation and replacement without phantom clicks',async t=>{
  const scene={initial:{x:100,y:80,held:false,clicks:0,ends:0,cancels:0},events:{
    drag:[{name:'x',value:'event.phase == "move" ? x + event.dx : x'},{name:'y',value:'event.phase == "move" ? y + event.dy : y'},{name:'held',value:'event.phase == "start" || event.phase == "move"'},{name:'ends',value:'event.phase == "end" ? ends + 1 : ends'},{name:'cancels',value:'event.phase == "cancel" ? cancels + 1 : cancels'}],
    click:[{name:'clicks',value:'clicks + 1'}],key:[{name:'x',value:'event.key == "ArrowRight" ? x + 5 : x'}]
  },marks:[{id:'point',type:'circle',x:{expr:'x'},y:{expr:'y'},r:20,interactive:true,label:'拖动点'}],width:400,height:200};
  const source=scene=>'root = Scene('+JSON.stringify(scene)+',"drag","拖拽场景")';
  const f=await fixture(t,source(scene)),{page}=f;
  const values=()=>page.evaluate(()=>window.shared.store.state.drag.values);
  const point=async(x,y,index=0)=>page.locator('.iui-scene-canvas').nth(index).evaluate((svg,{x,y})=>{const p=svg.createSVGPoint();p.x=x;p.y=y;const result=p.matrixTransform(svg.getScreenCTM());return{x:result.x,y:result.y};},{x,y});
  let start=await point(100,80),end=await point(180,100);
  await page.mouse.move(start.x,start.y);await page.mouse.down();assert.equal((await values()).held,true);
  await page.mouse.move(end.x,end.y);await page.mouse.up();
  let state=await values();assert.ok(Math.abs(state.x-180)<.5);assert.ok(Math.abs(state.y-100)<.5);assert.equal(state.held,false);assert.equal(state.ends,1);assert.equal(state.clicks,0,'release flushes the final move and does not synthesize click');
  await page.getByRole('button',{name:'展开交互内容'}).click();
  assert.equal(await page.getByRole('button',{name:'拖动点'}).count(),2);
  const mark=page.getByRole('button',{name:'拖动点'}).nth(1);await mark.focus();await page.keyboard.press('ArrowRight');assert.ok(Math.abs((await values()).x-185)<.5);
  start=await point(185,100,1);await page.mouse.move(start.x,start.y);await page.mouse.down();
  await page.getByRole('button',{name:'收回作品'}).dispatchEvent('click');assert.equal((await values()).held,false);assert.equal((await values()).cancels,1);await page.mouse.up();
  const cdp=await page.context().newCDPSession(page);
  start=await point(185,100);end=await point(225,120);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:end.x,y:end.y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  state=await values();assert.ok(Math.abs(state.x-225)<1,JSON.stringify(state));assert.ok(Math.abs(state.y-120)<1,JSON.stringify(state));assert.equal(state.clicks,0);assert.equal(state.ends,2);
  await page.waitForFunction(()=>window.shared.store.snapshot.status==='saved');await f.open();
  assert.ok(Math.abs((await values()).x-225)<1,'dragged position survives reload');
  start=await point(225,120);await page.mouse.move(start.x,start.y);await page.mouse.down();
  await f.replace(source({...scene,initial:{...scene.initial,x:200,y:60}}));await page.mouse.up();
  state=await values();assert.deepEqual(state,{...scene.initial,x:200,y:60},'old cancel and delayed pointer release never modify the new source');
  assert.deepEqual(f.errors,[]);
});
