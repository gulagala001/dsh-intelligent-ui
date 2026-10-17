import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { validateState } from '../src/host/storage.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const css = await readFile(join(root, 'src/client/styles/surface.css'), 'utf8');
const sourceSHA256 = Object.fromEntries(await Promise.all(['src/client/components/interactive.jsx', 'src/client/components/shared.jsx', 'src/client/document-store.mjs'].map(async file => [file, digest(await readFile(join(root, file)))])));
const compiled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
  import React from 'react';import{createRoot}from'react-dom/client';
  import{IntelligentSurface}from'./src/client/Surface.jsx';
  import{acquireDocument,disposeDocuments}from'./src/client/document-store.mjs';
  const source=window.initialSource,sessionId='synthetic-calculator-precision',blockId='1:1:0:0',lease=acquireDocument(sessionId,blockId);
  function App(){const[expanded,setExpanded]=React.useState(false);return <main><article><IntelligentSurface source={source} sessionId={sessionId} blockId={blockId} onExpand={()=>setExpanded(true)}/></article>{expanded&&<aside><IntelligentSurface source={source} sessionId={sessionId} blockId={blockId} expanded/><button onClick={()=>setExpanded(false)}>关闭作品</button></aside>}</main>;}
  const root=createRoot(document.getElementById('root'));root.render(<App/>);
  window.calculatorPrecision={store:lease.store,dispose:()=>{root.unmount();lease.release();disposeDocuments();}};
` }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const bundle = compiled.outputFiles[0].text;

async function fixture(t, source) {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }), errors = [], external = [], writes = [];
  let record = { source, sourceRevision: digest(source), revision: 0, componentsVersion: 4, state: {} };
  t.after(async () => { try { await page.evaluate(() => window.calculatorPrecision?.dispose()); } finally { await browser.close(); } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') { external.push(request.url()); return route.abort(); }
    if (url.pathname !== '/intelligent-ui/api/state') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div>' });
    if (request.method() === 'POST') {
      const input = request.postDataJSON();
      assert.equal(input.expectedRevision, record.revision);
      record = { ...input, state: validateState(input.state), revision: record.revision + 1, componentsVersion: 4 };
      writes.push(structuredClone(record.state));
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) });
  });
  const mount = async () => {
    await page.goto('http://127.0.0.1:9191/');
    await page.addStyleTag({ content: 'body{margin:16px}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}article,aside{min-width:0}' + css });
    await page.evaluate(source => { window.initialSource = source; }, source);
    await page.addScriptTag({ content: bundle });
    await page.locator('article .iui-surface-feedback').getByRole('status').filter({ hasText: '已保存' }).waitFor();
  };
  await mount();
  const evidence = async (name, extra = {}) => {
    if (!process.env.IUI_CALCULATOR_EVIDENCE) return;
    const directory = process.env.IUI_CALCULATOR_EVIDENCE;
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true });
    await writeFile(join(directory, `${name}.json`), JSON.stringify({ recordedAt: new Date().toISOString(), scope: 'actual React Surface and browser DOM with synthetic source and state API; no DSH host or new real-model request', sourceSHA256, bundleSHA256: digest(bundle), inputSHA256: digest(source), displayedOutputs: await page.locator('.iui-calculator output').allTextContents(), writes, persistedState: record.state, pageErrors: errors, externalRequests: external, ...extra }, null, 2));
  };
  return { page, mount, writes, record: () => record, evidence, errors, external };
}

test('Calculator precision 2 preserves exact money strings after local edits, expansion and saved-state recovery', { timeout: 30000 }, async t => {
  const source = 'root = Calculator([{name:"bill",label:"账单",type:"number",value:387,min:0},{name:"service",label:"服务费",type:"number",value:8,min:0},{name:"people",label:"人数",type:"number",value:5,min:1,step:1}],"bill * (1 + service / 100) / people","分账","每人金额","元",2)';
  const f = await fixture(t, source), { page } = f;
  assert.equal(await page.locator('.iui-calculator output').textContent(), '83.59元');
  await page.getByLabel('账单', { exact: true }).fill('250');
  await page.getByLabel('服务费', { exact: true }).fill('12');
  await page.getByLabel('人数', { exact: true }).fill('4');
  await f.evidence('edited-split-bill');
  assert.equal(await page.locator('.iui-calculator output').textContent(), '70.00元', 'numeric equality alone is insufficient for a two-decimal amount');
  await page.locator('article .iui-surface-feedback').getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.deepEqual(f.record().state, { bill: 250, service: 12, people: 4 });
  await page.getByRole('button', { name: '展开交互内容', exact: true }).click();
  assert.deepEqual(await page.locator('.iui-calculator output').allTextContents(), ['70.00元', '70.00元']);
  await page.locator('aside').getByLabel('账单', { exact: true }).fill('0');
  assert.deepEqual(await page.locator('.iui-calculator output').allTextContents(), ['0.00元', '0.00元']);
  await page.locator('aside').getByLabel('账单', { exact: true }).fill('250');
  await page.getByRole('button', { name: '关闭作品', exact: true }).click();
  await page.locator('article .iui-surface-feedback').getByRole('status').filter({ hasText: '已保存' }).waitFor();
  await f.mount();
  assert.deepEqual(await page.getByRole('spinbutton').evaluateAll(elements => elements.map(element => element.value)), ['250', '12', '4']);
  assert.equal(await page.locator('.iui-calculator output').textContent(), '70.00元');
  await f.evidence('restored-split-bill'); assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
});

test('Calculator displays finite positive, fractional, zero, negative and large amounts with fixed precision', { timeout: 30000 }, async t => {
  const f = await fixture(t, 'root = Calculator([{name:"amount",label:"金额",type:"number",value:70}],"amount","金额格式","金额","元",2)'), { page } = f;
  const samples = [];
  for (const [input, expected] of [['70', '70.00元'], ['0.5', '0.50元'], ['0', '0.00元'], ['-70', '-70.00元'], ['-0.5', '-0.50元'], ['1234567890123.5', '1,234,567,890,123.50元'], ['0.555', '0.56元']]) {
    await page.getByLabel('金额', { exact: true }).fill(input);
    const actual = await page.locator('.iui-calculator output').textContent();
    samples.push({ input, expected, actual }); assert.equal(actual, expected);
  }
  await f.evidence('money-format-boundaries', { samples }); assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
});

test('primary and additional Calculator results honor independent precision while retaining strings, null, errors and scene metrics', { timeout: 30000 }, async t => {
  const results = [{ label: '默认位数', formula: 'amount' }, { label: '一位', formula: 'amount', precision: 1 }, { label: '十位', formula: 'amount', precision: 10 }, { label: '零位', formula: '0.5', precision: 0 }, { label: '字符串', formula: '"70"' }, { label: '空值', formula: 'null' }, { label: '布尔', formula: 'true' }, { label: '错误', formula: '1 / 0' }];
  const scene = { initial: { value: 0.5, score: 0 }, events: {}, marks: [], width: 100, height: 50 };
  const source = `root = Stack([Calculator([{name:"amount",label:"输入",type:"number",value:70}],"amount","独立结果","主结果",null,0,${JSON.stringify(results)}),Calculator([],"0.5","一位主结果","结果",null,1),Calculator([],"0.5","十位主结果","结果",null,10),Simulation(${JSON.stringify(scene)},"simulation","模拟",[],[{label:"值",formula:"value",precision:2}]),Game(${JSON.stringify(scene)},"game","计数",null,[],[{label:"得分",formula:"score",precision:0}])])`;
  const f = await fixture(t, source), { page } = f;
  assert.deepEqual(await page.locator('.iui-calculator output').allTextContents(), ['70', '70.00', '70.0', '70.0000000000', '1', '70', '—', 'true', '0.5', '0.5000000000']);
  const failure = page.locator('.iui-calculation-result').filter({ hasText: '错误' });
  assert.equal(await failure.locator('output').count(), 0);
  assert.match(await failure.getByRole('alert').textContent(), /无效数字/);
  assert.deepEqual(await page.locator('.iui-scene-metrics .iui-result-value').allTextContents(), ['0.5', '0']);
  await page.getByLabel('输入', { exact: true }).fill('0');
  assert.deepEqual(await page.locator('.iui-calculator output').allTextContents(), ['0', '0.00', '0.0', '0.0000000000', '1', '70', '—', 'true', '0.5', '0.5000000000']);
  await f.evidence('independent-result-precision'); assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
});
