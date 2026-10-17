import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const field = props => ({ name: 'people', label: '人数', type: 'number', value: 1, min: 1, max: 10, step: 1, required: true, ...props });
const source = props => `root = Form("预约人数",[${JSON.stringify(field(props))}],[],"提交预约","按人数预约")`;
const result = await build({ stdin: { contents: 'export {fieldError} from "./src/client/components/controls.jsx"', resolveDir: root, loader: 'jsx' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { fieldError } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));

test('number fields enforce explicit step with min/value/zero bases and tolerate decimal rounding', () => {
  assert.match(fieldError(field(), 1.5), /步长/);
  assert.equal(fieldError(field(), 2), '');
  const valueBase = field({ min: undefined, max: undefined, value: 0.1, step: 0.2 });
  assert.match(fieldError(valueBase, 0.2), /步长/);
  assert.equal(fieldError(valueBase, 0.3), '');
  assert.equal(fieldError(field({ min: 0, value: 0.05, step: 0.1 }), 0.3), '', 'min overrides the initial value');
  assert.match(fieldError(field({ min: undefined, value: undefined, step: 0.2 }), 0.3), /步长/);
  assert.equal(fieldError(field({ min: undefined, value: undefined, step: 0.2 }), 0.4), '');
  for (const step of [undefined, null, 'any']) assert.equal(fieldError(field({ step }), 1.5), '', 'omitted steps retain the component any-step semantics');
  for (const [min, step, value] of [[0, 0.1, 0.3], [0.2, 0.1, 0.3], [-0.3, 0.1, -0.1], [0, 0.1, 0.1 + 0.2], [0, 1e-7, 3e-7]]) {
    assert.equal(fieldError(field({ min, max: undefined, step }), value), '', `${min}/${step}/${value} is aligned`);
    assert.match(fieldError(field({ min, max: undefined, step }), value + step / 2), /步长/);
  }
  assert.equal(fieldError(field(), null), '请填写此项');
  assert.equal(fieldError(field(), ''), '请填写此项');
  assert.equal(fieldError(field({ required: false }), null), '');
  assert.equal(fieldError(field({ required: false }), ''), '');
  assert.equal(fieldError(field(), NaN), '请输入有效数字');
  assert.equal(fieldError(field(), Infinity), '请输入有效数字');
  assert.equal(fieldError(field(), 0), '不能小于 1');
  assert.equal(fieldError(field(), 11), '不能大于 10');
  assert.equal(fieldError(field({ min: 0, max: undefined, step: 1e-308 }), 1e308), '', 'very fine steps never reject a finite large value through quotient overflow');
  assert.equal(fieldError(field({ min: -1e308, max: undefined, step: 1e308 }), 1e308), '', 'step arithmetic avoids overflowing the difference');
  assert.match(fieldError(field({ min: -1e308, max: undefined, step: 1e308 }), 9e307), /步长/);
  assert.match(fieldError(field({ min: 0, max: undefined, step: 1 }), 1e15 + 0.25), /步长/, 'large quotients never expand tolerance beyond a detectable fractional step');
});

const browserBundle = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
import React,{useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {Form} from './src/client/components/controls.jsx';
import {DocumentStore} from './src/client/document-store.mjs';
const root=createRoot(document.getElementById('root'));let sequence=0;
window.numberHarness={payloads:[],writes:0,open(source,saved={}){
 this.store?.dispose();this.payloads=[];this.writes=0;
 const store=new DocumentStore('synthetic-number-'+(++sequence),'1:0:0:0',{hash:async()=> 'synthetic-hash',read:async(_s,_b,input)=>({sourceRevision:'synthetic-hash',revision:input?input.revision+1:0,state:input?.state??saved})});
 this.sequence=sequence;this.store=store;store.update(source,false);root.render(<App key={sequence} store={store} sequence={sequence}/>);
},dispose(){root.unmount();this.store?.dispose();}};
function App({store,sequence}){
 const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot);
 const api={state:snapshot.state,set:(name,value)=>{window.numberHarness.writes++;store.set(name,value);},action:action=>store.action(action,text=>window.numberHarness.payloads.push(text))};
 return <div className="iui-surface" data-test-sequence={sequence} style={{padding:16,maxWidth:600}}>{snapshot.tree&&<Form props={snapshot.tree.props} api={api}/>}</div>;
}
window.numberHarness.open(${JSON.stringify(source({}))});` }, bundle: true, platform: 'browser', format: 'iife', write: false });

test('actual Chrome Form submits aligned numbers and surfaces step, range and required errors', async t => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } }), errors = [], cases = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:9191/**', route => route.fulfill({ body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }));
  await page.goto('http://127.0.0.1:9191/');
  await page.addStyleTag({ content: await readFile(join(root, 'src/client/styles/surface.css'), 'utf8') });
  await page.addScriptTag({ content: browserBundle.outputFiles[0].text });
  const ready = () => page.waitForFunction(() => window.numberHarness.store.snapshot.status === 'saved' && document.querySelector('.iui-surface')?.dataset.testSequence === String(window.numberHarness.sequence));
  const input = page.getByRole('spinbutton', { name: '人数' });
  const submit = page.getByRole('button', { name: '提交预约' });
  const open = async (props, saved = {}) => { await page.evaluate(({ source, saved }) => window.numberHarness.open(source, saved), { source: source(props), saved }); await ready(); };
  await ready();
  for (const [props, text, expectedError, stepMismatch] of [
    [{}, '1.5', /步长/, true],
    [{}, '2', null, false],
    [{ min: 0, value: 0, step: 0.1 }, '0.3', null, false],
    [{ min: 0, value: 0, step: 0.1 }, '0.35', /步长/, true],
    [{ min: undefined, value: 0.1, step: 0.2 }, '0.2', /步长/, true],
    [{ min: undefined, value: 0.1, step: 0.2 }, '0.3', null, false],
    [{ min: undefined, value: undefined, step: 0.2 }, '0.3', /步长/, true],
    [{ step: undefined }, '1.5', null, false],
    [{ step: null }, '1.5', null, false],
    [{ min: 0, max: undefined, step: 1e-308 }, '1e308', null, false],
    [{ min: -1e308, max: undefined, step: 1e308 }, '1e308', null, false],
    [{ min: -1e308, max: undefined, step: 1e308 }, '9e307', /步长/, true],
    [{}, '', /请填写此项/, false],
    [{ required: false }, '', null, false],
    [{}, '0', /不能小于 1/, false],
    [{}, '11', /不能大于 10/, false],
  ]) {
    await open(props);
    await input.fill(text);
    const native = await input.evaluate(el => ({ value: el.value, step: el.step, stepMismatch: el.validity.stepMismatch, valid: el.validity.valid, baseValue: el.getAttribute('value') }));
    assert.equal(native.stepMismatch, stepMismatch);
    if (props.step === undefined && Object.hasOwn(props, 'step') || props.step === null) assert.equal(native.step, 'any');
    await submit.click();
    const payloads = await page.evaluate(() => window.numberHarness.payloads), alerts = await page.getByRole('alert').allTextContents();
    cases.push({ props, text, native, payloads, alerts });
    if (process.env.IUI_NUMBER_EVIDENCE) { await mkdir(process.env.IUI_NUMBER_EVIDENCE, { recursive: true }); await writeFile(join(process.env.IUI_NUMBER_EVIDENCE, 'number-step-browser.result.json'), JSON.stringify({ syntheticStorageOnly: true, actualChromeReactDOM: true, realDSHHost: false, cases, errors }, null, 2) + '\n'); }
    if (expectedError) {
      assert.deepEqual(payloads, [], 'invalid numbers never enter a submission');
      assert.ok(alerts.some(message => expectedError.test(message)), 'the field validation error is visible');
      assert.equal(await input.getAttribute('aria-invalid'), 'true');
      assert.equal(await input.evaluate(el => document.activeElement === el), true);
    } else {
      assert.equal(payloads.length, 1);
      assert.deepEqual(alerts, []);
      assert.equal(JSON.parse(payloads[0].slice(payloads[0].indexOf('{'))).people, text === '' ? null : Number(text));
    }
  }
  await open({}, { people: 1.5 });
  assert.equal(await input.inputValue(), '1.5');
  assert.equal(await page.evaluate(() => window.numberHarness.writes), 0);
  await submit.click();
  await page.getByRole('alert').filter({ hasText: '步长' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.numberHarness.payloads), []);
  assert.equal(await page.evaluate(() => window.numberHarness.store.state.people), 1.5, 'saved invalid values remain untouched');
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  if (process.env.IUI_NUMBER_EVIDENCE) await page.screenshot({ path: join(process.env.IUI_NUMBER_EVIDENCE, 'number-step-dark-320.png'), fullPage: true });
  await input.fill('2');await submit.click();
  assert.match((await page.evaluate(() => window.numberHarness.payloads))[0], /"people": 2/);
  await page.evaluate(() => window.numberHarness.dispose());
  assert.deepEqual(errors, []);
  if (process.env.IUI_NUMBER_EVIDENCE) await writeFile(join(process.env.IUI_NUMBER_EVIDENCE, 'number-step-browser.result.json'), JSON.stringify({ passed: true, syntheticStorageOnly: true, actualChromeReactDOM: true, realDSHHost: false, cases, errors, preservedSavedValue: 1.5, correctedSubmission: 2 }, null, 2) + '\n');
});

test('restored numbers retain authored native step bases through arrows, spinner, blur, reset and source edits', async t => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } }), warnings = [], errors = [], cases = [];
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) warnings.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:9191/**', route => route.fulfill({ body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }));
  await page.goto('http://127.0.0.1:9191/');
  await page.addStyleTag({ content: await readFile(join(root, 'src/client/styles/surface.css'), 'utf8') });
  await page.addScriptTag({ content: browserBundle.outputFiles[0].text });
  const input = page.getByRole('spinbutton', { name: '人数' }), submit = page.getByRole('button', { name: '提交预约' });
  const ready = () => page.waitForFunction(() => window.numberHarness.store.snapshot.status === 'saved' && document.querySelector('.iui-surface')?.dataset.testSequence === String(window.numberHarness.sequence));
  const open = async (props, saved) => { await page.evaluate(({ source, saved }) => window.numberHarness.open(source, saved), { source: source(props), saved }); await ready(); };
  const snapshot = async label => {
    const native = await input.evaluate(el => ({ value: el.value, valueAttribute: el.getAttribute('value'), min: el.min, step: el.step, stepMismatch: el.validity.stepMismatch }));
    const record = await page.evaluate(() => ({ state: window.numberHarness.store.state, writes: window.numberHarness.writes, payloads: window.numberHarness.payloads }));
    cases.push({ label, native, ...record });
    if (process.env.IUI_NUMBER_EVIDENCE) { await mkdir(process.env.IUI_NUMBER_EVIDENCE, { recursive: true }); await writeFile(join(process.env.IUI_NUMBER_EVIDENCE, 'number-native-base.result.json'), JSON.stringify({ actualChromeReactDOM: true, syntheticStorageOnly: true, realDSHHost: false, cases, warnings, errors }, null, 2) + '\n'); }
    return native;
  };
  const props = { min: undefined, max: undefined, value: 0.1, step: 0.2 };
  await open(props, { people: 0.2, oldExtra: 'KEEP' });
  await snapshot('restored invalid without edits');
  await submit.click();
  assert.deepEqual(await page.evaluate(() => window.numberHarness.payloads), []);
  await page.getByRole('alert').filter({ hasText: '步长' }).waitFor();
  assert.equal(await page.evaluate(() => window.numberHarness.store.state.people), 0.2);
  assert.equal(await page.evaluate(() => window.numberHarness.writes), 0);
  await input.focus();await page.keyboard.press('ArrowUp');
  const advanced = await snapshot('native ArrowUp from restored invalid value');
  assert.equal(advanced.value, '0.3');
  assert.equal(advanced.valueAttribute, '0.1');
  assert.equal(advanced.stepMismatch, false);
  assert.equal(advanced.min, '', 'a step base never introduces a minimum');
  await submit.click();
  assert.equal(JSON.parse((await page.evaluate(() => window.numberHarness.payloads))[0].split('所选设置：\n')[1]).people, 0.3);
  await page.getByRole('alert').count().then(count => assert.equal(count, 0));
  await input.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
  const negative = await snapshot('native ArrowDown permits negative numbers');
  assert.equal(negative.value, '-0.1');assert.equal(negative.valueAttribute, '0.1');assert.equal(negative.stepMismatch, false);
  await submit.click();
  assert.equal(await page.evaluate(() => window.numberHarness.store.state.oldExtra), 'KEEP');
  assert.match((await page.evaluate(() => window.numberHarness.payloads))[1], /"people": -0\.1/);
  await input.fill('0.3');await submit.click();
  const blurred = await snapshot('typed valid value after blur and submit');
  assert.equal(blurred.value, '0.3');assert.equal(blurred.valueAttribute, '0.1');assert.equal(blurred.stepMismatch, false);

  await page.evaluate(() => window.numberHarness.store.reset('people'));
  await page.waitForFunction(() => document.querySelector('input').value === '0.1');
  assert.equal((await snapshot('reset to authored default')).valueAttribute, '0.1');
  await input.evaluate(el => { window.previousNumberInput = el; });
  const nextSource = source({ min: undefined, max: undefined, value: 1, step: 0.3 });
  await page.evaluate(source => window.numberHarness.store.update(source, false), nextSource);
  await page.waitForFunction(() => window.numberHarness.store.snapshot.status === 'saved' && document.querySelector('input').step === '0.3');
  assert.equal(await input.evaluate(el => el === window.previousNumberInput), true, 'source edits update the existing control');
  assert.equal((await snapshot('changed source uses new authored base')).valueAttribute, '1');
  await page.evaluate(() => window.numberHarness.store.reset('people'));
  await page.waitForFunction(() => document.querySelector('input').value === '1');
  await input.focus();await page.keyboard.press('ArrowDown');
  assert.equal((await snapshot('new source native ArrowDown')).value, '0.7');
  await submit.click();
  assert.match((await page.evaluate(() => window.numberHarness.payloads)).at(-1), /"people": 0\.7/);

  await open(props, { people: 0.2 });
  await input.hover();
  const box = await input.boundingBox(), padding = await input.evaluate(el => parseFloat(getComputedStyle(el).paddingRight));
  await page.mouse.click(box.x + box.width - padding - 5, box.y + box.height / 2 - 4);
  assert.equal((await snapshot('actual native upper spinner click')).value, '0.3');
  await page.mouse.click(box.x + box.width - padding - 5, box.y + box.height / 2 + 4);
  assert.equal((await snapshot('actual native lower spinner click')).value, '0.1');
  await submit.click();
  assert.match((await page.evaluate(() => window.numberHarness.payloads))[0], /"people": 0\.1/);

  await open({ min: 0, max: undefined, value: 0.05, step: 0.1 }, { people: 0.35 });
  await input.focus();await page.keyboard.press('ArrowDown');
  const fixedMin = await snapshot('fixed min overrides authored base with floating steps');
  assert.equal(fixedMin.value, '0.3');assert.equal(fixedMin.stepMismatch, false);
  await submit.click();
  assert.match((await page.evaluate(() => window.numberHarness.payloads))[0], /"people": 0\.3/);
  await page.evaluate(() => window.numberHarness.dispose());
  assert.deepEqual(errors, []);assert.deepEqual(warnings, []);
  if (process.env.IUI_NUMBER_EVIDENCE) await writeFile(join(process.env.IUI_NUMBER_EVIDENCE, 'number-native-base.result.json'), JSON.stringify({ passed: true, actualChromeReactDOM: true, syntheticStorageOnly: true, realDSHHost: false, cases, warnings, errors }, null, 2) + '\n');
});
