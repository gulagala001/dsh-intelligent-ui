import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const css = await readFile(join(root, 'src/client/styles/surface.css'), 'utf8');
const sourceSHA256 = Object.fromEntries(await Promise.all(['src/client/components/interactive.jsx', 'src/client/document-store.mjs', 'src/runtime/scene.mjs', 'src/client/scene-playback.mjs', 'src/client/host/pane.jsx'].map(async file => [file, digest(await readFile(join(root, file)))])));
const compiled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
  import React from 'react';import{createRoot}from'react-dom/client';
  import{IntelligentSurface}from'./src/client/Surface.jsx';
  import{acquireDocument,disposeDocuments,sourceHash}from'./src/client/document-store.mjs';
  import{installArtifactPane}from'./src/client/host/pane.jsx';
  const sessionId='synthetic-scene-budget',blockId='1:1:0:0',lease=acquireDocument(sessionId,blockId);
  let source=window.initialSource,revision=0,state={};
  lease.store.request=async(_session,_block,input)=>{if(input){state=structuredClone(input.state);revision++;}return{source,sourceRevision:await sourceHash(source),state:structuredClone(state),revision,componentsVersion:4};};
  window.sceneBudget={store:lease.store};
  let Body,open,signal=new AbortController();
  const ctx={uiSession:{adapter:{current:{getSnapshot:()=>({key:sessionId})}}},sidebarRightTabs:{register:()=>()=>{}},slots:{inject:(_slot,callback)=>callback(),register:(_options,component)=>{Body=component;return()=>{};}},sidebarRight:{mounted:{getSnapshot:()=>sessionId,subscribe:()=>()=>{}},openTab:(_kind,options)=>{signal=new AbortController();open(options.params);}}};
  const pane=installArtifactPane(ctx,{Surface:IntelligentSurface,bridge:{submit:async()=>{}}});
  function App(){const[params,setParams]=React.useState(null),[content,setContent]=React.useState(source);open=setParams;
    window.sceneBudget.replace=next=>{source=next;state={};revision=0;setContent(next);pane.update({source:next,streaming:false,sessionId,blockId});};
    const close=()=>{signal.abort();setParams(null);};
    return <main><article><IntelligentSurface source={content} sessionId={sessionId} blockId={blockId} onExpand={()=>pane.expand({source:content,streaming:false,sessionId,blockId})}/></article>{params&&<aside><Body sessionId={sessionId} useTabInfo={()=>({tab:{visible:true,signal:signal.signal,navigation:{params,revision:1},actions:{close}}})}/></aside>}</main>;}
  const root=createRoot(document.getElementById('root'));root.render(<App/>);
  window.sceneBudget.dispose=()=>{root.unmount();pane.dispose();signal.abort();lease.release();disposeDocuments();};
` }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const bundle = compiled.outputFiles[0].text;

function scene(marks = 100) {
  return { initial: { x: 0, speed: 1 }, events: { tick: [{ name: 'x', value: 'x + speed * event.dt' }] }, marks: Array.from({ length: marks }, (_, index) => ({ id: `particle-${index}`, type: 'circle', x: { expr: `x + ${20 + index % 20 * 25}${' + 0'.repeat(14)}` }, y: 20 + Math.floor(index / 20) * 50, r: 3, fill: 'blue' })), width: 600, height: 320 };
}
const simulation = (definition, bind, title) => `Simulation(${JSON.stringify(definition)},${JSON.stringify(bind)},${JSON.stringify(title)},[{name:"speed",label:"速度",type:"number",value:1,min:0,max:10,step:1}],[{label:"位移",formula:"x"}])`;

async function fixture(t, source) {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CFT_EXECUTABLE, args: ['--use-mock-keychain', '--password-store=basic'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } }), errors = [], external = [];
  t.after(async () => {
    try {
      const cleanup = await page.evaluate(() => { window.sceneBudget?.dispose(); return { disposed: window.sceneBudget.store.disposed, players: window.sceneBudget.store.playback.players.size }; });
      assert.deepEqual(cleanup, { disposed: true, players: 0 });
    } finally { await browser.close(); }
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><div id="root"></div>' }) : (external.push(route.request().url()), route.abort()));
  await page.goto('http://127.0.0.1:9191/');
  await page.addStyleTag({ content: 'body{margin:16px}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}article,aside{min-width:0}' + css });
  await page.evaluate(source => { window.initialSource = source; }, source);
  await page.addScriptTag({ content: bundle });
  await page.locator('article .iui-surface-feedback').getByRole('status').filter({ hasText: '已保存' }).waitFor();
  const values = bind => page.evaluate(bind => window.sceneBudget.store.state[bind]?.values, bind);
  const snapshot = () => page.evaluate(() => ({ time: performance.now(), values: Object.fromEntries(Object.entries(window.sceneBudget.store.state).filter(([, value]) => value?.values).map(([bind, value]) => [bind, value.values])), players: [...window.sceneBudget.store.playback.players].map(([bind, player]) => ({ bind, playing: player.playing, activeViews: [...player.views.values()].map(view => view.active) })), alerts: [...document.querySelectorAll('[role="alert"]')].map(element => element.textContent) }));
  const marks = () => page.locator('.iui-scene-canvas').evaluateAll(elements => elements.map(svg => [...svg.querySelectorAll('circle')].map(circle => Number(circle.getAttribute('cx')))));
  const evidence = async (name, extra = {}) => {
    if (!process.env.IUI_SCENE_BUDGET_EVIDENCE) return;
    const directory = process.env.IUI_SCENE_BUDGET_EVIDENCE;
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true });
    await writeFile(join(directory, `${name}.json`), JSON.stringify({ recordedAt: new Date().toISOString(), scope: 'actual React Surface, native pane component and browser DOM with synthetic content and state adapter; no DSH host or real model', sourceSHA256, bundleSHA256: digest(bundle), inputSHA256: digest(source), sourceChars: source.length, browserExecutable: process.env.CFT_EXECUTABLE || chromium.executablePath(), snapshot: await snapshot(), pageErrors: errors, externalRequests: external, ...extra }, null, 2));
  };
  return { page, values, snapshot, marks, evidence, errors, external };
}

test('a bounded 100-particle simulation keeps one clock when expanded, paused, closed and reopened', { timeout: 30000 }, async t => {
  const f = await fixture(t, `root = ${simulation(scene(), 'particles', '100 粒子模拟')}`), { page } = f;
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(1100);
  const inline = await f.snapshot();
  assert.equal(inline.players[0].playing, true); assert.ok(inline.values.particles.x > 0.6); assert.deepEqual(inline.alerts, []);
  await page.getByRole('button', { name: '展开交互内容', exact: true }).click();
  await page.locator('.iui-artifact-pane').waitFor();
  await page.waitForTimeout(1400);
  const expanded = await f.snapshot();
  await f.evidence('expanded-playing', { inline, expanded });
  assert.equal(expanded.players.length, 1); assert.deepEqual(expanded.players[0].activeViews, [true, true]);
  assert.equal(expanded.players[0].playing, true, 'expanding the same simulation must not exhaust the page budget');
  assert.ok(expanded.values.particles.x > inline.values.particles.x + 0.8); assert.deepEqual(expanded.alerts, []);
  assert.ok(expanded.values.particles.x - inline.values.particles.x <= (expanded.time - inline.time) / 1000 + .15, 'the second view must not double the simulation clock');
  const liveMarks = await f.marks(); assert.deepEqual(liveMarks[0], liveMarks[1], 'both live drawings use the same state');
  await page.locator('aside').getByRole('button', { name: '暂停', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '播放', exact: true }).count(), 2);
  const stopped = (await f.values('particles')).x;
  await page.waitForTimeout(180); assert.equal((await f.values('particles')).x, stopped);
  assert.deepEqual((await page.locator('.iui-scene-metrics .iui-result-value').allTextContents()).map(Number), [Math.round(stopped * 100) / 100, Math.round(stopped * 100) / 100]);
  const pausedMarks = await f.marks(); assert.deepEqual(pausedMarks[0], pausedMarks[1]); assert.equal(pausedMarks[0][0], stopped + 20);
  await page.locator('aside').getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '关闭交互作品', exact: true }).click();
  await page.waitForFunction(() => window.sceneBudget.store.state.particles.values.x > 2.8);
  assert.deepEqual((await f.snapshot()).players[0].activeViews, [true]);
  await page.getByRole('button', { name: '展开交互内容', exact: true }).click();
  await page.waitForTimeout(1100);
  assert.equal(await page.getByRole('button', { name: '暂停', exact: true }).count(), 2);
  assert.deepEqual((await f.snapshot()).players[0].activeViews, [true, true], 'reopening replaces the released view without leaking another lease');
  await page.locator('aside').getByRole('button', { name: '暂停', exact: true }).click();
  await page.locator('aside').getByLabel('速度', { exact: true }).fill('2');
  assert.deepEqual(await page.getByLabel('速度', { exact: true }).evaluateAll(elements => elements.map(element => element.value)), ['2', '2']);
  await page.locator('aside').getByRole('button', { name: '重新开始', exact: true }).click();
  assert.deepEqual(await f.values('particles'), { x: 0, speed: 2 });
  assert.deepEqual(await page.locator('.iui-scene-metrics .iui-result-value').allTextContents(), ['0', '0']);
  const restartedMarks = await f.marks(); assert.deepEqual(restartedMarks[0], restartedMarks[1]); assert.equal(restartedMarks[0][0], 20);
  await page.locator('aside').getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(300);
  await page.locator('aside').getByRole('button', { name: '暂停', exact: true }).click();
  const accelerated = (await f.values('particles')).x;
  assert.ok(accelerated > .4, 'the edited speed creates new simulation results');
  const acceleratedMarks = await f.marks(); assert.deepEqual(acceleratedMarks[0], acceleratedMarks[1]); assert.equal(acceleratedMarks[0][0], accelerated + 20);
  await page.getByRole('button', { name: '关闭交互作品', exact: true }).click();
  await page.locator('article').getByRole('button', { name: '重置', exact: true }).click();
  assert.deepEqual(await f.values('particles'), { x: 0, speed: 1 });
  await f.evidence('shared-controls-complete'); assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
});

test('independent simulations retain separate state and clocks across shared views and source replacement', { timeout: 30000 }, async t => {
  const first = { ...scene(1), height: 120 }, second = { ...scene(1), height: 120, initial: { x: 10, speed: 2 } };
  const f = await fixture(t, `root = Stack([${simulation(first, 'first', '模拟甲')},${simulation(second, 'second', '模拟乙')}])`), { page } = f;
  await page.getByRole('button', { name: '展开交互内容', exact: true }).click();
  await page.locator('aside').getByRole('region', { name: '模拟甲', exact: true }).getByRole('button', { name: '播放', exact: true }).click();
  await page.locator('article').getByRole('region', { name: '模拟乙', exact: true }).getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(() => window.sceneBudget.store.state.first.values.x > .2 && window.sceneBudget.store.state.second.values.x > 10.4);
  await page.locator('aside').getByRole('region', { name: '模拟乙', exact: true }).getByRole('button', { name: '暂停', exact: true }).click();
  const before = await f.snapshot();
  await page.waitForTimeout(180);
  const after = await f.snapshot();
  assert.ok(after.values.first.x > before.values.first.x); assert.equal(after.values.second.x, before.values.second.x);
  assert.deepEqual(after.players.map(player => player.playing), [true, false]);
  assert.deepEqual(after.players.map(player => player.activeViews), [[true, true], [true, true]]);
  const firstSimulation = page.locator('.iui-simulation').filter({ has: page.getByRole('region', { name: '模拟甲', exact: true }) });
  await firstSimulation.nth(1).getByLabel('速度', { exact: true }).fill('3');
  assert.deepEqual(await firstSimulation.getByLabel('速度', { exact: true }).evaluateAll(elements => elements.map(element => element.value)), ['3', '3']);
  assert.equal((await f.values('second')).speed, 2);
  await page.evaluate(() => { window.sceneBudget.oldPlayers = [...window.sceneBudget.store.playback.players.values()]; });
  const replacement = { ...scene(1), height: 120, initial: { x: 90, speed: 4 } };
  await page.evaluate(source => window.sceneBudget.replace(source), `root = ${simulation(replacement, 'first', '新模拟')}`);
  await page.getByRole('region', { name: '新模拟', exact: true }).first().waitFor();
  await page.locator('article .iui-surface-feedback').getByRole('status').filter({ hasText: '已保存' }).waitFor();
  assert.equal((await f.snapshot()).players.length, 1);
  assert.equal(await page.evaluate(() => window.sceneBudget.oldPlayers.every(player => player.disposed && !player.timer && player.views.size === 0)), true);
  assert.deepEqual(await page.locator('.iui-scene-metrics .iui-result-value').allTextContents(), ['90', '90']);
  assert.deepEqual(await f.marks(), [[110], [110]], 'source replacement cannot reuse the retired scene view');
  await page.locator('aside').getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(() => window.sceneBudget.store.state.first.values.x > 90.4);
  assert.equal(await page.getByRole('button', { name: '暂停', exact: true }).count(), 2);
  await f.evidence('independent-and-replaced', { before, after }); assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
});

test('actual independent animation work still triggers the page budget', { timeout: 30000 }, async t => {
  const source = `shared = ${JSON.stringify(scene())}\nroot = Grid([${['one', 'two', 'three', 'four'].map(bind => `Simulation(shared,"${bind}","${bind}",[],[{label:"位移",formula:"x"}])`).join(',')}],2)`;
  const f = await fixture(t, source), { page } = f;
  for (const simulation of await page.locator('.iui-simulation').all()) await simulation.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '请暂停部分动画后继续' }).first().waitFor();
  const rejected = await f.snapshot();
  assert.equal(rejected.players.length, 4); assert.ok(rejected.players.some(player => !player.playing));
  assert.ok(Object.values(rejected.values).every(values => Number.isFinite(values.x) && values.speed === 1));
  await f.evidence('page-budget-rejected', { rejected }); assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
});

test('a scene over its individual computation budget is rejected with playback disabled', { timeout: 30000 }, async t => {
  const excessive = { ...scene(0), marks: Array.from({ length: 4 }, (_, index) => ({ id: `excessive-${index}`, type: 'circle', x: { expr: 'sum(range(2000)) / 10000' }, y: 20, r: 3 })) };
  const f = await fixture(t, `root = ${simulation(excessive, 'excessive', '计算过量模拟')}`), { page } = f;
  await page.getByRole('alert').filter({ hasText: '这段交互超过了计算限制' }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: '播放', exact: true }).isDisabled(), true);
  assert.equal((await f.snapshot()).players[0].playing, false); assert.equal(await page.locator('.iui-scene-canvas').count(), 0);
  await f.evidence('individual-budget-rejected'); assert.deepEqual(f.errors, []); assert.deepEqual(f.external, []);
});
