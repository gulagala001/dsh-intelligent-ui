import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {catalog,examples} from '../src/catalog.mjs';
import {compile,evaluateDocument} from '../src/runtime/evaluate.mjs';
import {componentHarness,coinSimulation} from './fixtures/examples.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const launch=()=>chromium.launch({headless:true,executablePath:process.env.CFT_EXECUTABLE,args:['--use-mock-keychain','--password-store=basic']});
const css=await readFile(join(root,'src/client/styles/surface.css'),'utf8');
const evidence=process.env.IUI_UI_EVIDENCE;
const capture=async(page,name)=>{if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,name+'.png'),fullPage:true});}};
test('the public Native body theme marker switches and restores interactive surfaces',async t=>{
 const result=await build({entryPoints:[join(root,'test/fixtures/usability.jsx')],bundle:true,format:'iife',platform:'browser',write:false});
 const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('http://127.0.0.1:9191/**',route=>route.fulfill({body:'<!doctype html><div id="root"></div><div id="entrance"></div>'}));
 await page.goto('http://127.0.0.1:9191/');await page.addStyleTag({content:css});await page.addScriptTag({content:result.outputFiles[0].text});const surface=page.locator('.iui-surface');await surface.waitFor();
 assert.equal(await surface.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
 await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''));
 assert.equal(await surface.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(33, 33, 33)');assert.equal(await surface.evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');assert.equal(await surface.evaluate(el=>getComputedStyle(el).colorScheme),'dark');
 await capture(page,'native-body-dark');await page.evaluate(()=>document.body.removeAttribute('data-ds-dark-theme'));
 assert.equal(await surface.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
});
test('surface reports document and action states independently and prevents duplicate repair',async t=>{
 const result=await build({entryPoints:[join(root,'test/fixtures/usability.jsx')],bundle:true,format:'iife',platform:'browser',write:false});
 const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:9191/**',route=>route.fulfill({body:'<!doctype html><meta charset="utf-8"><div id="root"></div><button class="_newSession" style="width:180px;height:36px">新会话</button><div id="entrance"></div>'}));
 await page.goto('http://127.0.0.1:9191/');await page.addStyleTag({content:css});await page.addScriptTag({content:result.outputFiles[0].text});
 const more=page.getByRole('button',{name:'更多交互内容操作'});await more.waitFor();assert.equal(await page.getByRole('button',{name:'复制交互源文'}).isVisible(),false);await more.click();await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{}});
 await page.getByRole('button',{name:'复制交互源文'}).click();await page.getByText('已复制',{exact:true}).waitFor();
 assert.equal(await page.locator('.iui-actions-menu').getAttribute('open'),null);assert.equal(await more.evaluate(element=>element===document.activeElement),true);
 await page.evaluate(()=>window.usability.store.publish({status:'saving'}));
 assert.equal(await page.getByRole('status').filter({hasText:'正在保存'}).count(),1,'clipboard feedback never hides current document state');
 for(const [status,label] of [['unsaved','等待保存'],['conflict','设置冲突'],['save-error','尚未保存'],['load-error','读取失败']]){await page.evaluate(status=>window.usability.store.publish({status}),status);await page.getByRole('status').filter({hasText:label}).waitFor();}
 await page.evaluate(()=>window.usability.store.publish({status:'saved'}));
 await page.getByRole('button',{name:'增加人数'}).click();await page.waitForFunction(()=>window.usability.store.state.people===5);
 await page.getByRole('button',{name:'展开交互内容'}).click();assert.equal(await page.evaluate(()=>window.usability.expand[0].blockId),'0:0:0:0');
 await more.click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出',exact:true}).click();const exported=await download;assert.equal(exported.suggestedFilename(),'intelligent-ui.json');const document=JSON.parse(await readFile(await exported.path(),'utf8'));assert.equal(document.source,'root = Counter("人数","people",4,1,12)');assert.equal(document.state.people,5);assert.equal(document.protocolVersion,1);
 await more.click();await more.press('Escape');assert.equal(await page.locator('.iui-actions-menu').getAttribute('open'),null);
 await more.click();await page.getByRole('button',{name:'源文',exact:true}).click();assert.equal(await page.locator('.iui-source code').textContent(),'root = Counter("人数","people",4,1,12)');
 await page.evaluate(()=>window.usability.render('root = Counter("人数","people",4,1,12)',true));await page.waitForFunction(()=>document.querySelector('.iui-surface').getAttribute('aria-busy')==='true');assert.equal(await page.getByRole('button',{name:'增加人数'}).isDisabled(),true);
 await page.evaluate(()=>window.usability.render('root = Unknown("bad")'));const repair=page.getByRole('button',{name:'修复',exact:true});await repair.waitFor();await repair.click();
 assert.equal(await page.locator('.iui-error button').isDisabled(),true,'one pending explicit repair disables its trigger');assert.equal(await page.evaluate(()=>window.usability.repairs),1);
 await page.evaluate(()=>window.usability.resolveRepair());await page.getByText('修复请求已发送',{exact:true}).waitFor();assert.deepEqual(errors,[]);
 await capture(page,'surface-state-repair');await page.evaluate(()=>window.usability.dispose());
});
test('all 28 components retain a bounded light/dark/narrow layout and keyboard controls',async t=>{
 const scene=`root = Scene(${JSON.stringify(coinSimulation)},"scene","独立场景")`;
 const names=new Set();const walk=n=>{if(Array.isArray(n))n.forEach(walk);else if(n?.name){names.add(n.name);walk(n.props[catalog[n.name]?.children]);}};
 [...examples,scene].forEach(source=>walk(evaluateDocument(compile(source))));assert.deepEqual([...names].sort(),Object.keys(catalog).sort());
 const contents=componentHarness.replace('const sources=[...examples,...extendedExamples];',`const sources=[...examples,...extendedExamples,${JSON.stringify(scene)}];`);
 const result=await build({stdin:{contents,resolveDir:root,loader:'jsx'},bundle:true,format:'iife',platform:'browser',write:false});
 const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fulfill({body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'}):route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"/>'}));
 for(const theme of ['light','dark'])for(const width of [1280,320]){
  await page.setViewportSize({width,height:844});
  for(let i=0;i<examples.length+3;i++){
   await page.goto(`http://127.0.0.1:9191/?example=${i}&theme=${theme}`);await page.addStyleTag({content:css});await page.addScriptTag({content:result.outputFiles[0].text});await page.locator('.iui-surface').waitFor();
   assert.equal(await page.getByRole('alert').count(),0,`${i}/${theme}/${width}: successful render`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,`${i}/${theme}/${width}: document width`);
   if(i===0){const box=page.getByRole('checkbox').first();const checked=await box.isChecked();await box.focus();await page.keyboard.press('Space');assert.equal(await box.isChecked(),!checked);}
   if(i===5){const tab=page.getByRole('tab').first();await tab.focus();await page.keyboard.press('End');assert.equal(await page.getByRole('tab').last().getAttribute('aria-selected'),'true');}
   if(i===10){const plus=page.getByRole('button',{name:/增加/}).first();const prior=await page.locator('output').first().textContent();await plus.focus();await page.keyboard.press('Enter');assert.notEqual(await page.locator('output').first().textContent(),prior);}
   await capture(page,`component-${i}-${theme}-${width}`);
   if(width===320)for(const figure of await page.locator('.iui-figure-viewport').all()){
    const zoom=figure.getByRole('button',{name:'放大图形',exact:true});
    if(!await zoom.isVisible())continue;
    const svg=await figure.locator('svg').elementHandle(),before=await page.evaluate(()=>JSON.stringify(window.fixture.state));
    await zoom.click();assert.equal(await figure.locator('.iui-figure-scroll').getAttribute('data-original'),'true');
    assert.equal(await svg.evaluate(element=>element.isConnected),true,'the same interactive SVG remains mounted');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.fixture.state)),before,'figure magnification is view-local');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,'magnified figure scrolls locally');
    await figure.getByRole('button',{name:'适应宽度',exact:true}).click();
    assert.equal(await figure.locator('.iui-figure-scroll').getAttribute('data-original'),'false');
   }
  }
 }
 assert.deepEqual(errors,[]);
});

test('touch chat stays inside the full native new-session row and the toolbar remains reachable',async t=>{
 const result=await build({entryPoints:[join(root,'test/fixtures/usability.jsx')],bundle:true,format:'iife',platform:'browser',write:false});const browser=await launch();t.after(()=>browser.close());const context=await browser.newContext({viewport:{width:320,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
 await page.route('http://127.0.0.1:9191/**',route=>route.fulfill({body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><button class="_newSession" style="width:180px;height:36px">新会话</button><div id="entrance"></div>'}));await page.goto('http://127.0.0.1:9191/');await page.addStyleTag({content:css});await page.addScriptTag({content:result.outputFiles[0].text});const plus=page.getByRole('button',{name:'新建智能聊天',exact:true});await plus.waitFor();const b=await plus.boundingBox(),native=await page.locator('._newSession').boundingBox();assert.equal(b.width,44);assert.equal(b.height,44);assert.equal(native.width,180);assert.ok(b.x>=native.x+native.width/2&&b.x+b.width<=native.x+native.width);await plus.tap();assert.equal(await page.evaluate(()=>window.entranceCalls),1);const more=page.getByRole('button',{name:'更多交互内容操作'});assert.ok((await more.boundingBox()).height>=44);await more.tap();for(const button of await page.locator('.iui-surface-toolbar button:visible').all())assert.ok((await button.boundingBox()).height>=44);await page.getByRole('button',{name:'源文',exact:true}).tap();await capture(page,'touch-entrance-toolbar');
 await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='1000px';document.body.append(spacer);const toolbar=document.querySelector('.iui-surface-toolbar');window.scrollTo(0,toolbar.getBoundingClientRect().top+scrollY-8);});
 await more.tap();await page.waitForFunction(()=>document.querySelector('.iui-actions-menu').dataset.side==='bottom');const menu=await page.locator('.iui-actions-popover').boundingBox();assert.ok(menu.y>=0&&menu.y+menu.height<=844,'touch menu flips down when its anchor is near the viewport top');await capture(page,'touch-actions-top-edge');await more.tap();
});

test('semantic scene actions stay single-path, scoped and touch-accessible without cancelling a no-click drag',async t=>{
 const counterScene={
  initial:{score:0,clicks:0,keyTrips:0,chosen:'none'},seed:7,marks:[],width:300,height:180,
  events:{
   click:[{name:'score',value:'score + (event.id == "one" ? 1 : event.id == "two" ? 2 : 1000)'},{name:'clicks',value:'clicks + 1'},{name:'chosen',value:'event.id'}],
   key:[{name:'score',value:'score + (event.key == "Enter" || event.key == "1" ? 100 : 0)'},{name:'keyTrips',value:'keyTrips + 1'}],
  },
  actions:[
   {id:'one',label:'加一',symbol:'✚',selected:{expr:'chosen == "one"'},detail:{expr:'concat("累计 ", score)'},shortcut:'1',color:'blue'},
   {id:'two',label:'加二',symbol:'Ⅱ',selected:{expr:'chosen == "two"'},detail:'每次增加两分',shortcut:'2',color:'green'},
   {id:'locked',label:'禁用卡',symbol:'×',selected:false,disabled:true,detail:'此卡不能增加分数',shortcut:'3',color:'gray'},
  ],
 };
 const dragScene={
  initial:{x:80,y:70,held:false,phase:'idle',starts:0,ends:0,cancels:0},seed:9,width:300,height:180,
  events:{drag:[
   {name:'x',value:'event.phase == "move" ? clamp(x + event.dx, 18, 282) : x'},
   {name:'y',value:'event.phase == "move" ? clamp(y + event.dy, 18, 162) : y'},
   {name:'held',value:'event.phase == "start" || event.phase == "move"'},
   {name:'phase',value:'event.phase'},
   {name:'starts',value:'starts + (event.phase == "start" ? 1 : 0)'},
   {name:'ends',value:'ends + (event.phase == "end" ? 1 : 0)'},
   {name:'cancels',value:'cancels + (event.phase == "cancel" ? 1 : 0)'},
  ]},
  marks:[{id:'dot',type:'circle',x:{expr:'x'},y:{expr:'y'},r:16,fill:'blue',interactive:true,label:'拖拽计数点'}],
  // This card is disabled specifically by the absent click rule. An authored
  // disabled:true would mask the old activate -> cancelGesture regression.
  actions:[{id:'noClick',label:'无点击规则的卡',symbol:'◇',disabled:false,detail:'没有点击规则，因此不可用',shortcut:'d'}],
 };
 const sources=[
  `root = Stack([Input("范围外输入","outside",""),Game(${JSON.stringify(counterScene)},"actionCounter","奖励计数器","点击操作卡增加奖励分。",[],[{label:"奖励分",formula:"score",precision:0}])])`,
  `root = Scene(${JSON.stringify(dragScene)},"actionDrag","拖拽与禁用操作卡")`,
 ];
 const contents=componentHarness.replace('const sources=[...examples,...extendedExamples];',`const sources=${JSON.stringify(sources)};`);
 const result=await build({stdin:{contents,resolveDir:root,loader:'jsx'},bundle:true,format:'iife',platform:'browser',write:false});
 const browser=await launch();t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:320,height:844},hasTouch:true,isMobile:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://127.0.0.1:9191/**',route=>route.fulfill({body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'}));
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const getState=name=>page.evaluate(name=>structuredClone(window.fixture.state[name].values),name);
 const mount=async(index,theme)=>{
  await page.goto(`http://127.0.0.1:9191/?example=${index}&theme=${theme}`);await page.evaluate(()=>localStorage.clear());
  await page.addStyleTag({content:css});await page.addScriptTag({content:result.outputFiles[0].text});await page.locator('.iui-surface').waitFor();await settle();
 };
 const expectCounter=async(score,clicks,chosen)=>{
  await settle();assert.deepEqual(await getState('actionCounter'),{score,clicks,keyTrips:0,chosen},'public independent totals detect duplicate click/key paths');
  assert.equal(await page.locator('.iui-game .iui-result-value').textContent(),String(score));
 };
 for(const theme of ['light','dark']){
  await mount(0,theme);
  const game=page.locator('.iui-game'),scope=game.locator('section.iui-scene');
  const one=game.getByRole('button',{name:'加一',exact:true}),two=game.getByRole('button',{name:'加二',exact:true}),locked=game.getByRole('button',{name:'禁用卡',exact:true});
  assert.equal(await game.locator('.iui-scene-canvas,.iui-figure-viewport').count(),0,'marks:[] actions do not create an empty SVG canvas');
  assert.equal(await game.locator('.iui-scene-actions').getAttribute('role'),'group');
  assert.equal(await one.getAttribute('aria-keyshortcuts'),'1');assert.equal(await two.getAttribute('aria-keyshortcuts'),'2');
  assert.equal(await one.locator('.iui-scene-action-symbol').textContent(),'✚');assert.equal(await one.locator('.iui-scene-action-symbol').getAttribute('aria-hidden'),'true');
  assert.ok(await one.getAttribute('aria-describedby'));assert.equal(await one.locator('.iui-scene-action-detail').textContent(),'累计 0');
  assert.equal(await locked.isDisabled(),true);assert.equal(await one.getAttribute('aria-pressed'),'false');await expectCounter(0,0,'none');

  await one.click();await expectCounter(1,1,'one');assert.equal(await one.getAttribute('aria-pressed'),'true');assert.equal(await two.getAttribute('aria-pressed'),'false');
  assert.equal(await one.locator('.iui-scene-action-detail').textContent(),'累计 1');
  await two.focus();await page.keyboard.press('Enter');await expectCounter(3,2,'two');
  await one.focus();await page.keyboard.press('Space');await expectCounter(4,3,'one');
  await scope.focus();await page.keyboard.press('1');await expectCounter(5,4,'one');
  await page.keyboard.down('2');await expectCounter(7,5,'two');
  await page.keyboard.down('2');await page.keyboard.up('2');await expectCounter(7,5,'two');
  const beforeBlocked=await page.evaluate(()=>window.fixture.actions.length);
  await locked.dispatchEvent('click');await scope.focus();await page.keyboard.press('3');await expectCounter(7,5,'two');
  assert.equal(await page.evaluate(()=>window.fixture.actions.length),beforeBlocked,'disabled card and shortcut perform no action');

  const outside=page.getByRole('textbox',{name:'范围外输入',exact:true});await outside.focus();await page.keyboard.press('1');
  assert.equal(await outside.inputValue(),'1');await expectCounter(7,5,'two');
  assert.equal(await page.evaluate(()=>window.fixture.actions.length),beforeBlocked,'typing outside the scene is not intercepted by its shortcuts');
  await page.evaluate(()=>window.fixture.setStreaming(true));await settle();assert.equal(await one.isDisabled(),true);
  await one.dispatchEvent('click');await scope.dispatchEvent('keydown',{key:'1',bubbles:true});await expectCounter(7,5,'two');
  assert.equal(await page.evaluate(()=>window.fixture.actions.length),beforeBlocked,'global inactive controls also perform no action');
  await page.evaluate(()=>window.fixture.setStreaming(false));await settle();

  await one.tap();await expectCounter(8,6,'one');await two.tap();await expectCounter(10,7,'two');
  assert.deepEqual(await page.evaluate(()=>window.fixture.actions.filter(action=>action.name==='actionCounter'&&action.event==='click').map(action=>action.payload.id)),['one','two','one','one','two','one','two']);
  assert.equal(await page.evaluate(()=>window.fixture.actions.filter(action=>action.event==='key').length),0,'native button activation and registered shortcuts do not also emit scene key events');
  for(const card of [one,two,locked]){
   const box=await card.boundingBox();assert.ok(box.height>=44&&box.width>=44,`${theme}: action touch target`);
   assert.ok(box.x>=0&&box.x+box.width<=320.5,`${theme}: complete action card remains inside the viewport`);
  }
  assert.equal(await page.locator('.iui-surface').evaluate(element=>getComputedStyle(element).colorScheme),theme);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1,`${theme}: no horizontal document overflow`);
  await capture(page,`semantic-actions-counter-${theme}-320`);
  await game.locator('.iui-scene-toolbar').getByRole('button',{name:'重置',exact:true}).click();await expectCounter(0,0,'none');
  assert.equal(await page.evaluate(()=>window.fixture.state.actionCounter.seed),7);assert.equal(await one.getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>window.fixture.submits.length),0,'local actions never use the harness model-submission path');
 }

 await mount(1,'dark');
 const scene=page.locator('section.iui-scene'),mark=scene.locator('[data-iui-mark-id="dot"]');
 assert.equal(await scene.getByRole('button',{name:'无点击规则的卡',exact:true}).isDisabled(),true);
 await scene.locator('.iui-scene-canvas').scrollIntoViewIfNeeded();await settle();
 const screenPoint=(x,y)=>scene.locator('.iui-scene-canvas').evaluate((svg,point)=>{
  const matrix=svg.getScreenCTM();if(!matrix)throw Error('Visible SVG screen transform is required');
  const mapped=new DOMPoint(point.x,point.y).matrixTransform(matrix);return{x:mapped.x,y:mapped.y};
 },{x,y});
 await mark.evaluate(element=>element.addEventListener('pointerdown',event=>{window.observedActionPointer=event.pointerId;},{once:true}));
 const start=await screenPoint(80,70),end=await screenPoint(140,90);
 await page.mouse.move(start.x,start.y);await page.mouse.down();await settle();
 assert.deepEqual(await getState('actionDrag'),{x:80,y:70,held:true,phase:'start',starts:1,ends:0,cancels:0});
 assert.equal(await mark.getAttribute('data-iui-dragging'),'true');
 assert.equal(await mark.evaluate(element=>element.hasPointerCapture(window.observedActionPointer)),true,'the real mouse owns SVG pointer capture');
 await mark.focus();const actionsBeforeShortcut=await page.evaluate(()=>window.fixture.actions.length);
 await page.keyboard.press('d');await settle();
 assert.deepEqual(await getState('actionDrag'),{x:80,y:70,held:true,phase:'start',starts:1,ends:0,cancels:0},'a no-click card shortcut must not cancel an active drag');
 assert.equal(await mark.getAttribute('data-iui-dragging'),'true');assert.equal(await mark.evaluate(element=>element.hasPointerCapture(window.observedActionPointer)),true);
 assert.equal(await page.evaluate(()=>window.fixture.actions.length),actionsBeforeShortcut,'unavailable action performs neither click nor drag cancel');
 await capture(page,'semantic-actions-no-click-shortcut-held-drag-320');
 await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();await settle();
 const released=await getState('actionDrag');assert.ok(Math.abs(released.x-140)<=1&&Math.abs(released.y-90)<=1,'real dragging still reaches its independent target');
 assert.deepEqual({held:released.held,phase:released.phase,starts:released.starts,ends:released.ends,cancels:released.cancels},{held:false,phase:'end',starts:1,ends:1,cancels:0});
 assert.equal(await mark.getAttribute('data-iui-dragging'),null);assert.equal(await mark.evaluate(element=>element.hasPointerCapture(window.observedActionPointer)),false);
 const phases=await page.evaluate(()=>window.fixture.actions.filter(action=>action.name==='actionDrag'&&action.event==='drag').map(action=>action.payload.phase));
 assert.equal(phases[0],'start');assert.ok(phases.includes('move'));assert.equal(phases.at(-1),'end');assert.equal(phases.includes('cancel'),false);
 assert.equal(await page.evaluate(()=>window.fixture.submits.length),0);assert.deepEqual(errors,[]);
 await capture(page,'semantic-actions-no-click-drag-ended-320');
});

test('native held Scene and Chart buttons retire with their source while same-source edits retain focus',async t=>{
 const scene=score=>({initial:{score},seed:7,marks:[],width:300,height:180,events:{click:[{name:'score',value:'score + 10'}]},actions:[{id:'same',label:'增加奖励',detail:{expr:'concat("奖励 ",score)'}}]});
 const sources=[0,100].map(score=>`root = Scene(${JSON.stringify(scene(score))},"scene","奖励")`);
 sources.push(...[10,20].map(price=>`root = Chart("bar",[{category:"套餐",price:${price}}],"category",["price"],"套餐价格","chart",true,"category")`));
 const contents=`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {IntelligentSurface} from './src/client/Surface.jsx';
  import {acquireDocument,sourceHash,disposeDocuments} from './src/client/document-store.mjs';
  import {componentsVersion} from './src/protocol/version.mjs';
  const sources=${JSON.stringify(sources)},root=createRoot(document.getElementById('root')),lease=acquireDocument('retirement','0:0:0:0'),store=lease.store;
  const writes=[],edits=[];const originalSet=store.setValue.bind(store),originalAction=store.action.bind(store);store.setValue=(name,value)=>{edits.push({name,value:structuredClone(value)});return originalSet(name,value);};store.action=(value,onSubmit)=>{edits.push({action:structuredClone(value)});return originalAction(value,onSubmit);};
  store.request=async(_session,_block,input)=>{if(input){writes.push(structuredClone(input));return {...input,revision:input.expectedRevision+1,componentsVersion};}return {revision:7,sourceRevision:await sourceHash(store.snapshot.source),componentsVersion,state:{}};};
  window.retirement={store,sources,writes,edits,render(index){root.render(<IntelligentSurface source={sources[index]} streaming={false} sessionId="retirement" blockId="0:0:0:0"/>);},dispose(){root.unmount();lease.release();disposeDocuments();}};
 `;
 const bundle=await build({stdin:{contents,resolveDir:root,loader:'jsx'},bundle:true,format:'iife',platform:'browser',write:false});
 const browser=await launch();t.after(()=>browser.close());const errors=[];
 const mount=async index=>{
  const page=await browser.newPage({viewport:{width:800,height:800}});page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://127.0.0.1:9191/**',route=>route.fulfill({body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'}));
  await page.goto('http://127.0.0.1:9191/');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(index=>window.retirement.render(index),index);
  await page.waitForFunction(index=>window.retirement.store.snapshot.source===window.retirement.sources[index]&&window.retirement.store.snapshot.status==='saved',index);
  return page;
 };
 const control=(page,kind)=>kind==='Scene'?page.getByRole('button',{name:'增加奖励',exact:true}):page.locator('.iui-chart-category-list').getByRole('button',{name:'套餐',exact:true});
 const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 for(const kind of ['Scene','Chart'])for(const press of ['Space','pointer']){
  const a=kind==='Scene'?0:2,b=a+1,page=await mount(a),buttonA=control(page,kind),oldDOM=await buttonA.elementHandle();
  await buttonA.focus();
  if(press==='Space')await page.keyboard.down('Space');
  else{const box=await buttonA.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();}
  assert.equal(await page.evaluate(()=>window.retirement.edits.length),0,`${kind}/${press}: pressing alone does not edit A`);
  await page.evaluate(index=>window.retirement.render(index),b);
  await page.waitForFunction(index=>window.retirement.store.snapshot.source===window.retirement.sources[index]&&window.retirement.store.snapshot.status==='saved',b);
  const buttonB=control(page,kind);assert.equal(await buttonB.isEnabled(),true);assert.equal(await oldDOM.evaluate(element=>element.isConnected),false,`${kind}/${press}: old native activation target is retired`);
  const before=await page.evaluate(()=>structuredClone(window.retirement.store.state));
  if(press==='Space')await page.keyboard.up('Space');
  else{const box=await buttonB.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.up();}
  await settle(page);await page.evaluate(()=>window.retirement.store.save());
  assert.deepEqual(await page.evaluate(()=>window.retirement.store.state),before,`${kind}/${press}: releasing A cannot mutate B`);
  assert.equal(await page.evaluate(()=>window.retirement.edits.length),0);assert.equal(await page.evaluate(()=>window.retirement.writes.length),0);assert.equal(await page.evaluate(()=>window.retirement.store.dirty.size),0);
  if(kind==='Scene')assert.equal(await buttonB.locator('.iui-scene-action-detail').textContent(),'奖励 100');
  else{assert.equal(await buttonB.getAttribute('aria-pressed'),'true');assert.match(await page.locator('svg [data-chart-row="0"]').getAttribute('aria-label'),/20/);}
  await capture(page,`native-source-retirement-${kind.toLowerCase()}-${press.toLowerCase()}`);await page.evaluate(()=>window.retirement.dispose());await page.close();
 }
 for(const kind of ['Scene','Chart']){
  const page=await mount(kind==='Scene'?1:3),button=control(page,kind),sameDOM=await button.elementHandle();await button.focus();
  await page.evaluate(()=>window.retirement.store.set('unrelated','same-source-edit'));await settle(page);
  assert.equal(await sameDOM.evaluate(element=>element.isConnected&&element===document.activeElement),true,`${kind}: state updates preserve the button and its focus`);
  await page.evaluate(()=>window.retirement.store.save());
  for(const [index,key] of ['Enter','Space'].entries()){
   const before=await page.evaluate(()=>({edits:window.retirement.edits.length,writes:window.retirement.writes.length}));await button.focus();await page.keyboard.press(key);await settle(page);
   assert.equal(await page.evaluate(()=>window.retirement.edits.length),before.edits+1,`${kind}/${key}: native activation edits once`);
   if(kind==='Scene'){assert.equal(await page.evaluate(()=>window.retirement.store.state.scene.values.score),110+index*10);assert.equal(await button.locator('.iui-scene-action-detail').textContent(),`奖励 ${110+index*10}`);}
   else{assert.equal(await page.evaluate(()=>window.retirement.store.state.chart.hiddenCategories.length),index===0?1:0);assert.equal(await button.getAttribute('aria-pressed'),index===0?'false':'true');}
   await page.evaluate(()=>window.retirement.store.save());assert.equal(await page.evaluate(()=>window.retirement.writes.length),before.writes+1,`${kind}/${key}: one activation saves once`);
   assert.equal(await sameDOM.evaluate(element=>element.isConnected&&element===document.activeElement),true,`${kind}/${key}: normal activation retains native focus`);
  }
  await page.evaluate(()=>window.retirement.dispose());await page.close();
 }
 assert.deepEqual(errors,[]);
});
