import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { compile, evaluateDocument } from '../src/runtime/evaluate.mjs';
import { collectDefaults } from '../src/runtime/defaults.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const available = [{ label: '未开放', value: 'closed', disabled: true }, { label: '标准', value: 'standard' }, { label: '完整', value: 'full' }];
const formSource = field => `root = Form("选择",[${JSON.stringify({ name: 'plan', label: '方案', type: 'select', required: true, ...field })}])`;
const defaults = field => collectDefaults(evaluateDocument(compile(formSource(field))));
const validationBundle = await build({ stdin: { contents: 'export {fieldError} from "./src/client/components/controls.jsx"', resolveDir: root, loader: 'jsx' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { fieldError } = await import('data:text/javascript;base64,' + Buffer.from(validationBundle.outputFiles[0].text).toString('base64'));

test('select defaults skip disabled options and leave all-disabled or missing options unselected', () => {
  assert.equal(defaults({ options: available }).plan, 'standard');
  assert.equal(defaults({ options: [available[0]] }).plan, null);
  assert.equal(defaults({ options: [] }).plan, null);
  assert.equal(defaults({}).plan, null);
  assert.equal(defaults({ options: [null, available[1]] }).plan, null, 'null scalar options never throw');
  for (const value of ['closed', 'full', 'missing', null]) assert.equal(defaults({ options: available, value }).plan, value, 'explicit values remain intact');
  assert.equal(defaults({ options: [false, 0, 'text'] }).plan, false);
});

test('select validation rejects disabled and stale values while accepting enabled scalar values', () => {
  const field = { type: 'select', required: true, options: available };
  assert.equal(fieldError(field, 'closed'), '请选择有效选项');
  assert.equal(fieldError({ ...field, required: false }, 'closed'), '请选择有效选项');
  assert.equal(fieldError(field, 'missing'), '请选择有效选项');
  assert.equal(fieldError(field, null), '请填写此项');
  assert.equal(fieldError({ ...field, options: [] }, 'standard'), '请选择有效选项');
  assert.equal(fieldError({ type: 'select', required: true }, undefined), '请填写此项');
  for (const value of ['standard', 'full']) assert.equal(fieldError(field, value), '');
  for (const value of [false, 0, 'text']) assert.equal(fieldError({ type: 'select', required: true, options: [false, 0, 'text'] }, value), '');
  assert.equal(fieldError({ type: 'select', options: available }, null), '');
});

const browserBundle = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
import React, {useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {Form, InputControl} from './src/client/components/controls.jsx';
import {DocumentStore} from './src/client/document-store.mjs';
const root=createRoot(document.getElementById('root'));
let sequence=0;
window.selectHarness={payloads:[],writes:0,open(source,saved={}){
 this.store?.dispose();this.payloads=[];this.writes=0;
 const store=new DocumentStore('synthetic-select-'+(++sequence),'1:0:0:0',{hash:async()=> 'synthetic-hash',read:async(_s,_b,input)=>({sourceRevision:'synthetic-hash',revision:input?input.revision+1:0,state:input?.state??saved})});
 this.sequence=sequence;this.store=store;store.update(source,false);root.render(<App key={sequence} store={store} sequence={sequence}/>);
},dispose(){root.unmount();this.store?.dispose();}};
function App({store,sequence}){
 const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot),tree=snapshot.tree;
 const api={state:snapshot.state,set:(name,value)=>{window.selectHarness.writes++;store.set(name,value);},action:action=>store.action(action,text=>window.selectHarness.payloads.push(text))};
 return <div className="iui-surface" data-test-sequence={sequence} style={{padding:16,maxWidth:600}}>{tree?.name==='Form'?<Form props={tree.props} api={api}/>:tree?.name==='Select'?<InputControl props={tree.props} api={api} kind="select"/>:null}</div>;
}
window.selectHarness.open(${JSON.stringify(formSource({options: available}))});` }, bundle: true, platform: 'browser', format: 'iife', write: false });

test('real React DOM select submission excludes disabled values and preserves saved values until a valid gesture', async t => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:9191/**', route => route.fulfill({ body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }));
  await page.goto('http://127.0.0.1:9191/');
  await page.addStyleTag({ content: await readFile(join(root, 'src/client/styles/surface.css'), 'utf8') });
  await page.addScriptTag({ content: browserBundle.outputFiles[0].text });
  const ready = () => page.waitForFunction(() => window.selectHarness.store.snapshot.status === 'saved' && document.querySelector('.iui-surface')?.dataset.testSequence === String(window.selectHarness.sequence));
  const open = async (field, saved = {}) => { await page.evaluate(({ source, saved }) => window.selectHarness.open(source, saved), { source: formSource(field), saved }); await ready(); };
  const submit = () => page.getByRole('button', { name: '提交', exact: true }).click();
  const state = () => page.evaluate(() => window.selectHarness.store.state.plan);
  const payloads = () => page.evaluate(() => window.selectHarness.payloads);
  const select = page.getByRole('combobox', { name: '方案' });
  await ready();
  assert.equal(await select.inputValue(), '1');
  await submit();
  assert.equal((await payloads()).length, 1);
  assert.match((await payloads())[0], /"plan": "standard"/);
  assert.doesNotMatch((await payloads())[0], /closed/);
  await select.evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await state(), 'standard', 'even a synthetic change cannot select a disabled option');
  assert.equal(await page.evaluate(() => window.selectHarness.writes), 0);

  for (const field of [{ options: [available[0]] }, { options: [] }, {}]) {
    await open(field);
    assert.equal(await state(), null);
    assert.equal(await select.inputValue(), '-1');
    await submit();
    assert.deepEqual(await payloads(), []);
    assert.equal(await select.getAttribute('aria-invalid'), 'true');
    await page.getByRole('alert').filter({ hasText: '请填写此项' }).waitFor();
    assert.equal(await select.evaluate(el => document.activeElement === el), true);
  }

  for (const [field, saved] of [[{ options: available, value: 'closed' }, {}], [{ options: available }, { plan: 'closed' }], [{ options: available }, { plan: 'missing' }]]) {
    await open(field, saved);
    const invalid = saved.plan ?? field.value;
    assert.equal(await state(), invalid);
    await page.getByRole('alert').filter({ hasText: '请选择有效选项' }).waitFor();
    assert.equal(await page.evaluate(() => window.selectHarness.writes), 0, 'render never rewrites saved selections');
    await submit();
    assert.deepEqual(await payloads(), []);
    await select.selectOption('2');
    assert.equal(await state(), 'full');
    await submit();
    assert.match((await payloads())[0], /"plan": "full"/);
  }

  await open({ options: available, value: 'full' });
  assert.equal(await select.inputValue(), '2');
  await submit();
  assert.match((await payloads())[0], /"plan": "full"/);

  const dynamicSource = '$closed = false\nroot = Form("选择",[{name:"plan",label:"方案",type:"select",required:true,value:"standard",options:[{label:"标准",value:"standard",disabled:$closed},{label:"完整",value:"full"}]}])';
  await page.evaluate(source => window.selectHarness.open(source), dynamicSource);
  await ready();
  await page.evaluate(() => window.selectHarness.store.set('closed', true));
  await page.getByRole('alert').filter({ hasText: '请选择有效选项' }).waitFor();
  assert.equal(await state(), 'standard');
  await submit();
  assert.deepEqual(await payloads(), []);
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  if (process.env.IUI_UI_EVIDENCE) { await mkdir(process.env.IUI_UI_EVIDENCE, { recursive: true }); await page.screenshot({ path: join(process.env.IUI_UI_EVIDENCE, 'disabled-select-dark-320.png'), fullPage: true }); }
  await select.selectOption('1');
  await submit();
  assert.match((await payloads())[0], /"plan": "full"/);

  await page.evaluate(() => window.selectHarness.open('root = Select("原生选择","plan",[false,0,"text"],false)'));
  await ready();
  const native = page.getByRole('combobox', { name: '原生选择' });
  assert.equal(await native.inputValue(), '0');
  await native.focus();
  assert.equal(await native.evaluate(el => document.activeElement === el && el.tagName === 'SELECT'), true);
  await native.selectOption('1');
  assert.equal(await state(), 0, 'native DOM selection preserves numeric scalar values');
  await native.selectOption('2');
  assert.equal(await state(), 'text');
  await native.selectOption('0');
  assert.equal(await state(), false, 'native DOM selection preserves boolean scalar values');
  await page.evaluate(() => window.selectHarness.dispose());
  assert.deepEqual(errors, []);
});
