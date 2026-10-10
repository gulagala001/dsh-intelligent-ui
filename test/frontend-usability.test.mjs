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
  }
 }
 assert.deepEqual(errors,[]);
});

test('touch entrance and toolbar remain reachable without covering the native new-session button',async t=>{
 const result=await build({entryPoints:[join(root,'test/fixtures/usability.jsx')],bundle:true,format:'iife',platform:'browser',write:false});const browser=await launch();t.after(()=>browser.close());const context=await browser.newContext({viewport:{width:320,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
 await page.route('http://127.0.0.1:9191/**',route=>route.fulfill({body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><button class="_newSession" style="width:180px;height:36px">新会话</button><div id="entrance"></div>'}));await page.goto('http://127.0.0.1:9191/');await page.addStyleTag({content:css});await page.addScriptTag({content:result.outputFiles[0].text});const plus=page.getByRole('button',{name:'新建智能聊天',exact:true});await plus.waitFor();const b=await plus.boundingBox(),native=await page.locator('._newSession').boundingBox();assert.equal(b.width,44);assert.equal(b.height,44);assert.ok(b.x>=native.x+native.width&&b.x+b.width<=320);await plus.tap();assert.equal(await page.evaluate(()=>window.entranceCalls),1);const more=page.getByRole('button',{name:'更多交互内容操作'});assert.ok((await more.boundingBox()).height>=44);await more.tap();for(const button of await page.locator('.iui-surface-toolbar button:visible').all())assert.ok((await button.boundingBox()).height>=44);await page.getByRole('button',{name:'源文',exact:true}).tap();await capture(page,'touch-entrance-toolbar');
 await page.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='1000px';document.body.append(spacer);const toolbar=document.querySelector('.iui-surface-toolbar');window.scrollTo(0,toolbar.getBoundingClientRect().top+scrollY-8);});
 await more.tap();await page.waitForFunction(()=>document.querySelector('.iui-actions-menu').dataset.side==='bottom');const menu=await page.locator('.iui-actions-popover').boundingBox();assert.ok(menu.y>=0&&menu.y+menu.height<=844,'touch menu flips down when its anchor is near the viewport top');await capture(page,'touch-actions-top-edge');await more.tap();
});
