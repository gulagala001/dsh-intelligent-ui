import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const form = (title, button) => `root = Form(${JSON.stringify(title)},[{name:"note",label:"说明",type:"text"}],[],${JSON.stringify(button)},"MESSAGE")`;
const sourceA = form('回答甲', '提交甲'), sourceB = form('回答乙', '提交乙');
const sources = ['src/client/host/session.mjs', 'src/client/Surface.jsx', 'src/client/document-store.mjs'];
const sourceSHA256 = Object.fromEntries(await Promise.all(sources.map(async file => [file, digest(await readFile(join(root, file)))])));
const bundle = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
  import React from 'react';import{createRoot}from'react-dom/client';
  import{IntelligentSurface}from'./src/client/Surface.jsx';
  import{createSessionBridge}from'./src/client/host/session.mjs';
  import{disposeDocuments}from'./src/client/document-store.mjs';
  const observable=value=>{const listeners=new Set();return{getSnapshot:()=>value,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},set:next=>{value=next;for(const listener of listeners)listener()}}};
  const calls=[],echoes=[],abandoned=[],receipts=new Map(),current=observable({key:'synthetic-session'}),panelInfo=observable({activePanelId:null});
  const binding={session:{getSnapshot:()=>({removed:false}),beginSubmission:input=>{const requestId='request-'+echoes.length;echoes.push({requestId,...input});return{requestId,abandon:()=>abandoned.push(requestId)}},
    prompt:(content,mode,signal,requestId)=>{calls.push({sessionId:'synthetic-session',content,mode,requestId});return new Promise((resolve,reject)=>{const abort=()=>{receipts.delete(requestId);reject(signal.reason)};signal.addEventListener('abort',abort,{once:true});receipts.set(requestId,result=>{signal.removeEventListener('abort',abort);receipts.delete(requestId);resolve(result)});if(signal.aborted)abort()})}}};
  const bridge=createSessionBridge({uiSession:{adapter:{current}},layout:{panelInfo},sessions:{binding:()=>binding,using:async(_id,_options,operation)=>operation({binding,ready:Promise.resolve()})}});
  window.harness={calls,echoes,abandoned,settle:(id,ok=true)=>receipts.get(id)?.(ok?{ok:true,value:{accepted:true}}:{ok:false,error:{message:'FIRST_REFUSED'}}),switchAway:()=>current.set({key:'other-session'}),dispose:()=>{bridge.dispose();disposeDocuments()}};
  const surface=(view,blockId,source)=><section data-view={view}><IntelligentSurface sessionId="synthetic-session" blockId={blockId} source={source} onSubmit={text=>bridge.submit('synthetic-session',blockId,text)}/></section>;
  createRoot(document.getElementById('root')).render(<>{surface('inline','1:0:0:0',${JSON.stringify(sourceA)})}{surface('expanded','1:0:0:0',${JSON.stringify(sourceA)})}{surface('other-block','1:0:0:1',${JSON.stringify(sourceB)})}</>);
` }, bundle: true, write: false, format: 'iife', platform: 'browser' });

test('real forms preserve independent pending submission snapshots and same-block inline/expanded dedupe', { timeout: 30000 }, async t => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CFT_EXECUTABLE ? { executablePath: process.env.CFT_EXECUTABLE } : {}), args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [], records = new Map();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:9191/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname !== '/intelligent-ui/api/state') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div>' });
    const block = request.method() === 'POST' ? request.postDataJSON().block : url.searchParams.get('block');
    let record = records.get(block) ?? { revision: 0, componentsVersion: 4, sourceRevision: digest(block === '1:0:0:0' ? sourceA : sourceB), state: {} };
    if (request.method() === 'POST') record = { ...request.postDataJSON(), revision: record.revision + 1 };
    records.set(block, record); return route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) });
  });
  await page.goto('http://127.0.0.1:9191/');
  await page.addStyleTag({ content: await readFile(join(root, 'src/client/styles/surface.css'), 'utf8') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const inline = page.locator('[data-view="inline"]'), expanded = page.locator('[data-view="expanded"]'), other = page.locator('[data-view="other-block"]');
  await inline.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  await other.getByRole('status').filter({ hasText: '已保存' }).waitFor();
  await inline.getByRole('textbox', { name: '说明' }).fill('VALUE-AT-FIRST-CLICK');
  await inline.getByRole('button', { name: '提交甲', exact: true }).click();
  await expanded.getByRole('button', { name: '提交甲', exact: true }).click();
  assert.equal(await page.evaluate(() => window.harness.calls.length), 1, 'one same-block intent has one pending native queue call across views');
  await expanded.getByRole('textbox', { name: '说明' }).fill('VALUE-AT-SECOND-CLICK');
  await expanded.getByRole('button', { name: '提交甲', exact: true }).click();
  await other.getByRole('textbox', { name: '说明' }).fill('VALUE-AT-FIRST-CLICK');
  await other.getByRole('button', { name: '提交乙', exact: true }).click();
  const calls = await page.evaluate(() => window.harness.calls);
  assert.equal(calls.length, 3, 'distinct same-block content and distinct block origins each reach native queue');
  assert.equal(new Set(calls.map(call => call.requestId)).size, 3);
  assert.equal(calls.every(call => call.sessionId === 'synthetic-session' && call.mode === 'queue'), true);
  assert.equal(calls[0].content[0].text, calls[2].content[0].text, 'identical text from a different block remains independent');
  assert.match(calls[0].content[0].text, /VALUE-AT-FIRST-CLICK/);
  assert.match(calls[1].content[0].text, /VALUE-AT-SECOND-CLICK/);
  await other.getByRole('textbox', { name: '说明' }).fill('LATER-UNSUBMITTED-EDIT');
  assert.deepEqual(await page.evaluate(() => window.harness.calls), calls, 'later field edits cannot rewrite accepted submission payloads');
  await page.evaluate(() => { window.harness.settle('request-0', false); window.harness.settle('request-1'); window.harness.settle('request-2'); });
  await inline.getByRole('alert').filter({ hasText: 'FIRST_REFUSED' }).waitFor();
  assert.equal(await other.getByRole('alert').count(), 0, 'the first native refusal does not masquerade as the other block receipt');
  assert.deepEqual(await page.evaluate(() => window.harness.abandoned), ['request-0']);
  await other.getByRole('button', { name: '提交乙', exact: true }).click();
  await page.evaluate(() => window.harness.switchAway());
  await other.getByRole('alert').filter({ hasText: '会话已切换' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.harness.abandoned), ['request-0', 'request-3']);
  assert.deepEqual(errors, []);
  if (process.env.IUI_SUBMIT_EVIDENCE) {
    const directory = process.env.IUI_SUBMIT_EVIDENCE; await mkdir(directory, { recursive: true, mode: 0o700 });
    await page.screenshot({ path: join(directory, 'submit-concurrency-ui.png'), fullPage: true });
    await writeFile(join(directory, 'submit-concurrency-ui.result.json'), JSON.stringify({ ranAt: new Date().toISOString(), sourceSHA256,
      bundleSHA256: digest(bundle.outputFiles[0].text), realBrowserStarted: true, syntheticHostAPI: true,
      realDSHHostStarted: false, calls, snapshotPreserved: true, sameBlockDedupePreserved: true,
      independentReceipts: true, navigationCancellation: true, errors }, null, 2) + '\n', { mode: 0o600 });
  }
  await page.evaluate(() => window.harness.dispose());
});
