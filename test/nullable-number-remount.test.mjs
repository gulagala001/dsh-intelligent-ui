import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {IntelligentSurface} from './src/client/Surface.jsx';
import {acquireDocument,disposeDocuments,sourceHash} from './src/client/document-store.mjs';
const source=window.initialNumberSource,lease=acquireDocument('synthetic-nullable-number','1:0:0:0'),store=lease.store;
let remote={amount:null,oldExtra:'KEEP'},revision=1;
window.nullableHarness={store,writes:0,payloads:[]};
store.request=async(_s,_b,input)=>{if(input){remote=structuredClone(input.state);revision++;}return{sourceRevision:await sourceHash(source),revision,state:structuredClone(remote)};};
const set=store.set.bind(store);store.set=(...args)=>{window.nullableHarness.writes++;return set(...args);};
function App(){const[visible,setVisible]=useState(true);window.nullableHarness.hide=()=>setVisible(false);window.nullableHarness.show=()=>setVisible(true);return visible?<IntelligentSurface source={source} sessionId="synthetic-nullable-number" blockId="1:0:0:0" onSubmit={text=>window.nullableHarness.payloads.push(text)}/>:<span>closed</span>;}
const root=createRoot(document.getElementById('root'));root.render(<App/>);
window.nullableHarness.dispose=()=>{root.unmount();lease.release();disposeDocuments();};` }, bundle: true, platform: 'browser', format: 'iife', write: false });

test('actual Surface remount keeps optional null numbers visibly empty without changing their native step bases or stored state', async t => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const cases = [], errors = [], warnings = [];
  const evidence = process.env.IUI_NULLABLE_EVIDENCE;
  const writeEvidence = async passed => { if (evidence) { await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, 'nullable-number-remount.result.json'), JSON.stringify({ passed, actualChromeSurface: true, syntheticStorageOnly: true, realDSHHost: false, cases, errors, warnings }, null, 2) + '\n'); } };
  for (const [field, attribute, arrowUp] of [
    [{ value: 0.1, step: 0.2 }, '0.1', '0.1'],
    [{ value: 0.05, min: 0, step: 0.1 }, '0.05', '0.1'],
    [{ step: 1 }, '0', '1'],
  ]) {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 } });
    try {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (['error', 'warning'].includes(message.type())) warnings.push(message.text()); });
      await page.route('http://127.0.0.1:9191/**', route => route.fulfill({ body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' }));
      await page.goto('http://127.0.0.1:9191/');
      await page.addStyleTag({ content: await readFile(join(root, 'src/client/styles/surface.css'), 'utf8') });
      const source = `root = Form("金额",[${JSON.stringify({ name: 'amount', label: '金额', type: 'number', required: false, ...field })}],[],"提交金额")`;
      await page.evaluate(source => { window.initialNumberSource = source;document.body.setAttribute('data-ds-dark-theme',''); }, source);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const input = page.getByRole('spinbutton', { name: '金额' }), submit = page.getByRole('button', { name: '提交金额' });
      await page.waitForFunction(() => window.nullableHarness.store.snapshot.status === 'saved');
      await input.waitFor();
      const snapshot = async label => {
        const record = { label, source, native: await input.evaluate(el => ({ value: el.value, valueAttribute: el.getAttribute('value'), min: el.min, step: el.step, stepMismatch: el.validity.stepMismatch })), ...await page.evaluate(() => ({ state: window.nullableHarness.store.state, writes: window.nullableHarness.writes, payloads: window.nullableHarness.payloads })) };
        cases.push(record);await writeEvidence(false);return record;
      };
      const remount = async () => {
        await page.evaluate(() => window.nullableHarness.hide());await input.waitFor({ state: 'detached' });
        await page.evaluate(() => window.nullableHarness.show());await input.waitFor();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      };
      const before = await snapshot('hydrated null');
      assert.equal(before.native.value, '');assert.equal(before.state.amount, null);assert.equal(before.writes, 0);
      for (let round = 1; round <= 3; round++) {
        await remount();
        const reopened = await snapshot('null remount ' + round);
        assert.equal(reopened.native.value, '', 'changing defaultValue never fills a pristine controlled empty input');
        assert.equal(reopened.native.valueAttribute, attribute);
        assert.equal(reopened.native.stepMismatch, false);
        assert.equal(reopened.state.amount, null);assert.equal(reopened.state.oldExtra, 'KEEP');assert.equal(reopened.writes, 0);
      }
      if (evidence) await page.screenshot({ path: join(evidence, 'nullable-reopened-' + attribute + '-320-dark.png'), fullPage: true });
      await submit.click();
      assert.deepEqual(await page.getByRole('alert').allTextContents(), []);
      assert.equal(JSON.parse((await page.evaluate(() => window.nullableHarness.payloads))[0].split('所选设置：\n')[1]).amount, null);
      assert.equal(await input.inputValue(), '');
      await input.focus();await page.keyboard.press('ArrowUp');
      assert.equal(await input.inputValue(), arrowUp);
      assert.equal(await input.evaluate(el => el.validity.stepMismatch), false);
      await submit.click();
      assert.equal(JSON.parse((await page.evaluate(() => window.nullableHarness.payloads))[1].split('所选设置：\n')[1]).amount, Number(arrowUp));
      await input.fill('');
      const writes = await page.evaluate(() => window.nullableHarness.writes);
      await remount();
      const cleared = await snapshot('cleared by user then remounted');
      assert.equal(cleared.native.value, '');assert.equal(cleared.state.amount, null);assert.equal(cleared.writes, writes);
      await submit.click();
      assert.equal(JSON.parse((await page.evaluate(() => window.nullableHarness.payloads))[2].split('所选设置：\n')[1]).amount, null);
      await page.evaluate(() => window.nullableHarness.dispose());
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);assert.deepEqual(warnings, []);
  await writeEvidence(true);
});
