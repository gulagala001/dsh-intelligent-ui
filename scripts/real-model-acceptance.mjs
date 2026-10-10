import assert from 'node:assert/strict';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { realHostFixture } from '../test/fixtures/real-host.mjs';
import { until } from '../test/fixtures/host.mjs';
import { compile, evaluateDocument, safeEvaluate } from '../src/runtime/evaluate.mjs';
import { splitResponse } from '../src/protocol/split.mjs';
import { initialScene, sceneView, sceneTransition, sceneSet } from '../src/runtime/scene.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const { values: args } = parseArgs({ options: { 'profile-route-file': { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' }, 'repair-response': { type: 'string' }, 'request-cap': { type: 'string' }, 'natural-questions': { type: 'boolean', default: false } } });
const requestCap = Number(args['request-cap'] ?? 10);
assert.ok(Number.isInteger(requestCap) && requestCap >= 1 && requestCap <= 16, 'Explicit request cap must be within 1..16');
const evidence = resolve(process.env.IUI_REAL_EVIDENCE ?? join(repo, 'work/real-model', new Date().toISOString().replace(/[:.]/g, '-')));
const cases = [
  { id: 'split-bill', refs: ['interactive'], prompt: '制作可交互分账计算器：账单387元，服务费8%，5个人均分。用户可以修改三个参数；标注每人应付，精确到两位小数。字段标签固定为“账单金额”“服务费百分比”“人数”。', required: ['Calculator'] },
  { id: 'checklist', refs: ['inputs'], prompt: '制作一个周末计划勾选清单，恰好四项：晨间散步、整理书桌、采购晚餐、阅读半小时。勾选后显示已完成数量，可以取消勾选。', required: ['Checklist'] },
  { id: 'motion', refs: ['interactive', 'expressions'], prompt: '制作可调速度与加速度的一维运动模拟。初始位置20、速度30、加速度10；运动遵守x+=v*dt+0.5*a*dt*dt，v+=a*dt。使用Simulation和Scene事件，滑块标签为“速度”“加速度”。显示小球位置、速度，可播放暂停与重置，场景宽600、高200。', required: ['Simulation'] },
  { id: 'novel-game', refs: ['interactive', 'expressions'], prompt: '制作一个简洁的“顺序点灯”小游戏，只有三盏可点击灯、下一步提示、得分和重置。灯的标签固定为“灯1”“灯2”“灯3”。必须按灯1→灯2→灯3顺序点击才获一分，顺序错误则进度归零且不加分；每轮完成进度归零，可以继续下一轮。以通用Game/Scene规则表达，不要使用点圆得分、井字棋或记忆配对模板。布局简洁，不要装饰或动画，不添加其他功能。', required: ['Game'] },
  { id: 'plans-chart-tabs', refs: ['layout', 'data'], prompt: '比较三个虚构套餐：轻量月费29、容量100GB，标准月费59、容量500GB，专业月费99、容量2000GB。使用标签为“套餐表”“月费图”的Tabs分别展示Table与柱状Chart，图表支持本地选择数据行与系列显示，表格支持排序。只使用提供的数据，不上网。', required: ['Tabs', 'Table', 'Chart'] },
];
const naturalPrompts={
  'split-bill':'做一个可以直接调整的分账工具：账单387元，加8%服务费，5人均分。三个输入分别叫“账单金额”“服务费百分比”“人数”，每人应付显示两位小数。',
  checklist:'给我一个可以直接勾选的周末清单，只有晨间散步、整理书桌、采购晚餐、阅读半小时四项，显示完成数量，勾选可以取消。',
  motion:'用一个可操作的模拟解释匀加速运动：小球初始位置20、速度30、加速度10。可以调整“速度”“加速度”，播放、暂停、重置。每段时间dt遵守位移v*dt+0.5*a*dt*dt与速度增加a*dt。画布600×200。',
  'novel-game':'做一个可以直接玩的顺序点灯小游戏。只有“灯1”“灯2”“灯3”、下一步提示、得分和重置。按灯1→灯2→灯3才加一分，点错则进度归零，不加分。每轮完成后进度归零，接着玩下一轮。支持点击和键盘，布局简洁。',
  'plans-chart-tabs':'比较三款虚构套餐：轻量月费29、容量100GB，标准月费59、容量500GB，专业月费99、容量2000GB。给我“套餐表”和“月费图”两个页签，表格可排序，柱状图可选择数据并切换系列显示。只用这些数据。',
};
const selected = process.env.IUI_REAL_CASE ? cases.filter(item => process.env.IUI_REAL_CASE.split(',').includes(item.id)) : cases;
assert.ok(selected.length, 'Unknown IUI_REAL_CASE');
let repair, priorGeneratedTokens = {};
if (args['repair-response']) {
  assert.equal(selected.length, 1, 'An explicit repair must select exactly one case');
  repair = JSON.parse(await readFile(args['repair-response'], 'utf8'));
  assert.equal(repair.case, selected[0].id, 'Repair must name the original case');
  let consumed = 0;
  for (const file of await readdir(dirname(args['repair-response']))) {
    if (!file.endsWith('-response.json')) continue;
    const call = JSON.parse(await readFile(join(dirname(args['repair-response']), file), 'utf8'));
    if (call.case === repair.case) consumed += call.usage?.completion_tokens ?? 0;
  }
  priorGeneratedTokens = { [repair.case]: consumed };
}
const cleanup = [], results = [];
const t = { passed: true, after: fn => cleanup.push(fn), diagnostic: text => { /* isolate host diagnostics */ } };
const flatten = tree => tree ? [tree, ...(tree.props?.children ?? []).flatMap(flatten)] : [];
const numberOutput = value => Number(value.replace(/[^\d.-]/g, ''));
async function changeNumber(locator, value) {
  if (await locator.getAttribute('type') !== 'range') return locator.fill(String(value));
  const min = Number(await locator.getAttribute('min')), step = Number(await locator.getAttribute('step') ?? 1);
  const increments = Math.round((value - min) / step);
  assert.ok(increments >= 0 && increments <= 500, 'Slider keyboard transition must be bounded');
  await locator.press('Home'); for (let index = 0; index < increments; index++) await locator.press('ArrowRight');
  assert.equal(Number(await locator.inputValue()), value);
}
const fieldControl = (surface, label) => surface.getByLabel(new RegExp(`^${label}(?:[\\s·]|$)`));
let f;
try {
  f = await realHostFixture(t, { settingsPath: process.env.IUI_REAL_SETTINGS, profileRouteFile: args['profile-route-file'], provider: args.provider, model: args.model, evidenceDirectory: evidence, priorGeneratedTokens, requestCap });
  const health = (await f.api('/health')).body;
  for (const item of selected) {
    f.setCase(item.id);
    console.log(`${item.id}: native DSH generation with ${f.model}`);
    const begin = f.calls.length;
    try {
      await f.page.getByRole('button', { name: '新建智能聊天', exact: true }).first().click();
      await f.page.getByRole('button', { name: 'Intelligent UI', exact: true }).waitFor({ timeout: 15000 });
      const box = f.page.locator('[contenteditable="true"]').first();
      const correction = repair ? `\n\n这是测试人员明确请求的一次修正。上一份响应在真实compile中失败：“括号不匹配”。请检查Scene对象的花括号归属，width/height必须属于scene对象。保留需求并输出完整修正版；不执行自动循环。原始公开测试响应：\n${repair.text}` : '';
      await box.fill(args['natural-questions']?naturalPrompts[item.id]+correction:`这是独立的公开一般测试问题。请先调用原生skill工具读取intelligent-ui，再使用文件读取工具读取该技能resource base下${item.refs.map(ref => `references/${ref}.md`).join('、')}的完整资料。必须实际读取资料再生成；不要创建文件或调用其他工具。\n\n${item.prompt}${correction}`);
      await box.press('Enter');
      const final = await until(() => {
        const calls = f.calls.slice(begin);
        if (calls.some(call => call.error)) throw new Error(calls.find(call => call.error).error);
        if (calls.some(call => call.finishReason === 'length')) throw new Error('The configured token ceiling truncated the model response');
        const complete=calls.find(call=>call.finished&&call.finishReason==='stop'&&!call.toolCalls.length);
        if(complete&&!splitResponse(complete.text).some(part=>part.kind==='ui'))throw new Error('The model finished without an interactive answer');
        return complete;
      }, 300000);
      const segments = splitResponse(final.text).filter(part => part.kind === 'ui');
      assert.ok(segments.length, 'Model must generate an openui fence');
      const trees = segments.map(part => { assert.ok(part.complete); return evaluateDocument(compile(part.text)); });
      const nodes = trees.flatMap(flatten);
      for (const name of item.required) assert.ok(nodes.some(node => node.name === name), `Missing ${name}`);
      const surface = f.page.locator('.iui-surface').first(); await surface.waitFor({ state: 'visible', timeout: 15000 });
      await until(async () => !await surface.locator('input:disabled,button:disabled').count(), 15000);
      assert.equal(await surface.locator('.iui-error').count(), 0, 'Rendered answer contains runtime errors');
      const beforeControls = f.calls.length;
      if (item.id === 'split-bill') {
        const calculator = nodes.find(node => node.name === 'Calculator').props;
        const values = Object.fromEntries(calculator.fields.map(field => [field.name, field.value]));
        assert.ok(Math.abs(safeEvaluate(calculator.formula, {}, values) - 83.592) < 1e-9);
        assert.equal(numberOutput(await surface.locator('.iui-result-value').first().innerText()), 83.59);
        await fieldControl(surface, '账单金额').fill('250');
        await fieldControl(surface, '服务费百分比').fill('12');
        await fieldControl(surface, '人数').fill('4');
        await until(async () => numberOutput(await surface.locator('.iui-result-value').first().innerText()) === 70);
      } else if (item.id === 'checklist') {
        assert.equal(nodes.find(node => node.name === 'Checklist').props.items.length, 4);
        await surface.getByRole('checkbox').nth(0).check(); await surface.getByRole('checkbox').nth(2).check();
        assert.equal(await surface.getByRole('progressbar').getAttribute('aria-valuenow'), '2');
        await surface.getByRole('checkbox').nth(0).uncheck();
        assert.equal(await surface.getByRole('progressbar').getAttribute('aria-valuenow'), '1');
      } else if (item.id === 'motion') {
        const p = nodes.find(node => node.name === 'Simulation').props;
        const velocity = p.fields.find(field => field.label === '速度'), acceleration = p.fields.find(field => field.label === '加速度');
        assert.ok(velocity && acceleration, 'Both motion parameters must exist');
        let record = initialScene(p.scene);
        const positionKey = Object.keys(record.values).find(key => record.values[key] === 20);
        assert.ok(positionKey, 'Initial position must equal 20');
        record = sceneSet(p.scene, record, velocity.name, 40); record = sceneSet(p.scene, record, acceleration.name, 20);
        record = sceneTransition(p.scene, record, 'tick', { dt: .1 });
        assert.ok(Math.abs(record.values[positionKey] - 24.1) < 1e-9, 'Independent displacement assertion');
        assert.ok(Math.abs(record.values[velocity.name] - 42) < 1e-9, 'Independent velocity assertion');
        sceneView(p.scene, record);
        await changeNumber(fieldControl(surface, '速度'), 40); await changeNumber(fieldControl(surface, '加速度'), 20);
        const moving = p.scene.marks.find(mark => mark.type === 'circle' && typeof mark.x === 'object' && mark.x?.expr);
        assert.ok(moving, 'Motion must render a formula-driven ball');
        const ball = surface.locator(`[data-iui-mark-id=${JSON.stringify(moving.id)}] circle`), start = await ball.getAttribute('cx');
        await surface.getByRole('button', { name: '播放', exact: true }).click();
        await until(async () => await ball.getAttribute('cx') !== start, 5000);
        await surface.getByRole('button', { name: '暂停', exact: true }).click();
        await surface.locator('.iui-scene-toolbar').getByRole('button', { name: '重置', exact: true }).click();
        assert.equal(await ball.getAttribute('cx'), start, 'Reset restores initial ball position');
      } else if (item.id === 'novel-game') {
        const p = nodes.find(node => node.name === 'Game').props, lamps = ['灯1','灯2','灯3'].map(label => p.scene.marks.find(mark => mark.label === label));
        assert.ok(lamps.every(mark => mark?.interactive), 'All three lamps must be interactive');
        let record = initialScene(p.scene), original = structuredClone(record.values);
        for (const mark of lamps) record = sceneTransition(p.scene, record, 'click', { id: mark.id });
        const changed = Object.keys(original).filter(key => typeof original[key] === 'number' && record.values[key] === original[key] + 1);
        assert.equal(changed.length, 1, 'One completed sequence earns one score');
        const score = changed[0]; record = sceneTransition(p.scene, record, 'click', { id: lamps[1].id });
        assert.equal(record.values[score], original[score] + 1, 'Wrong order earns no score');
        record = initialScene(p.scene);
        for (const index of [0,2,1,2]) record = sceneTransition(p.scene, record, 'click', { id: lamps[index].id });
        assert.equal(record.values[score], original[score], 'Wrong order resets sequence progress');
        for (const mark of lamps) record = sceneTransition(p.scene, record, 'click', { id: mark.id });
        assert.equal(record.values[score], original[score] + 1, 'A fresh correct sequence works after a mistake');
        const beforeScene = await surface.locator('.iui-scene-canvas').textContent();
        for (const label of ['灯1','灯2','灯3']) await surface.getByRole('button', { name: label, exact: true }).click();
        assert.notEqual(await surface.locator('.iui-scene-canvas').textContent(), beforeScene, 'Completed sequence must visibly update score');
        const scoreMark = p.scene.marks.find(mark => mark.type === 'text' && mark.text?.expr && new RegExp(`\\b${score}\\b`).test(mark.text.expr));
        assert.ok(scoreMark, 'Game must visibly show its score');
        const scoreText = surface.locator(`[data-iui-mark-id=${JSON.stringify(scoreMark.id)}]`);
        assert.equal(numberOutput(await scoreText.textContent()), original[score] + 1);
        for (const label of ['灯1','灯2','灯3']) await surface.getByRole('button', { name: label, exact: true }).press('Enter');
        assert.equal(numberOutput(await scoreText.textContent()), original[score] + 2, 'Keyboard sequence supports the next round');
        await surface.getByRole('button', { name: '灯2', exact: true }).press('Enter');
        assert.equal(numberOutput(await scoreText.textContent()), original[score] + 2, 'Wrong keyboard order earns no score');
        await surface.locator('.iui-scene-toolbar').getByRole('button', { name: '重置', exact: true }).click();
        assert.equal(numberOutput(await scoreText.textContent()), original[score], 'Reset restores score');
      } else {
        const chart = nodes.find(node => node.name === 'Chart').props;
        const series = typeof chart.series[0] === 'string' ? chart.series[0] : chart.series[0].key;
        assert.deepEqual(chart.data.map(row => row[series]), [29,59,99]);
        await surface.getByRole('tab', { name: '月费图', exact: true }).click();
        assert.equal(await surface.getByRole('tab', { name: '月费图', exact: true }).getAttribute('aria-selected'), 'true');
        const legend = surface.locator('.iui-chart-legend button').first(); await legend.click(); assert.equal(await legend.getAttribute('aria-pressed'), 'false'); await legend.click();
        await surface.locator('.iui-chart-data summary').click(); await surface.locator('.iui-data-select').first().click();
        assert.equal(await surface.locator('.iui-data-select').first().getAttribute('aria-pressed'), 'true');
        await surface.getByRole('tab', { name: '套餐表', exact: true }).click(); await surface.locator('.iui-table-sort').first().click();
      }
      assert.equal(f.calls.length, beforeControls, 'Local operations must issue zero extra model requests');
      const calls = f.calls.slice(begin);
      assert.ok((priorGeneratedTokens[item.id] ?? 0) + calls.reduce((sum, call) => sum + f.usedTokens(call), 0) <= 16384, 'Generated-token ceiling must be respected');
      if(!args['natural-questions'])assert.ok(calls.some(call => call.toolCalls.some(tool => tool.function?.name?.includes('skill'))), 'Native skill invocation must occur');
      // Exact public reference paths must appear in a real native read tool call, never simulated prompt injection.
      const toolText = calls.map(call => JSON.stringify(call.toolCalls)).join('\n');
      if(!args['natural-questions'])for (const ref of item.refs) assert.ok(toolText.includes(`references/${ref}.md`), `Native tool must read ${ref} reference`);
      const returnedResources = calls.map(call => JSON.stringify(call.nativeToolResults)).join('\n');
      if(!args['natural-questions']){
        assert.ok(returnedResources.includes('Installed base catalog'), 'Native skill must successfully return its content');
        for (const ref of item.refs) assert.ok(returnedResources.includes(ref === 'expressions' ? 'Bounded expressions and scene events' : `${ref} components`), `Native filesystem must successfully return ${ref} reference`);
      }
      await f.page.screenshot({ path: join(evidence, `${item.id}.png`), fullPage: true });
      await f.writeEvidence(`${item.id}-document.json`, { answer: final.text, sources: segments.map(part => part.text), trees, checks: 'independent runtime and native Web operations', zeroExtraModelRequests: true });
      results.push({ id: item.id, passed: true, requests: calls.length, completionTokens: calls.reduce((sum, call) => sum + (call.usage?.completion_tokens ?? 0), 0), generatedTokenBudgetCount: calls.reduce((sum, call) => sum + f.usedTokens(call), 0) });
      console.log(`${item.id}: PASS (${calls.length} requests)`);
    } catch (error) {
      results.push({ id: item.id, passed: false, error: f.scrub(error.message), requests: f.calls.length - begin });
      await f.page.screenshot({ path: join(evidence, `${item.id}-failure.png`), fullPage: true }).catch(() => {});
      await writeFile(join(evidence, `${item.id}-page.txt`), f.scrub(await f.page.locator('body').innerText()), { mode: 0o600 });
      console.log(`${item.id}: FAIL (${f.scrub(error.message)})`);
    }
    await f.writeEvidence('summary.json', { mode: 'packaged-native-cli-web-real-model', naturalQuestions:Boolean(args['natural-questions']), model: f.model, health, packageSha256: f.packageSha256, perCaseGeneratedTokenCeiling: 16384, perCaseRealRequestCap: requestCap, explicitRepairTurns: repair ? 1 : 0, priorGeneratedTokens, results,
      notRun: selected.filter(item => !results.some(result => result.id === item.id)).map(item => item.id),
      offeredReasoningEfforts: f.offeredReasoningEfforts,
      calls: f.calls.map(({ number, case: id, usage, finishReason, error, errorScope, reasoningEffort }) => ({ number, case: id, usage, finishReason, error, errorScope, reasoningEffort })), auxiliaryLocalTitles: f.auxiliary.length, hostErrors: f.errors });
    if (f.calls.slice(begin).some(call => call.errorScope==='route')) break; // A refused route cannot validate subsequent cases; one case's cap does not invalidate others.
  }
  assert.deepEqual(f.errors, [], 'No native browser errors');
  console.log(JSON.stringify(await f.scrubEvidence()));
} finally {
  for (const close of cleanup.reverse()) await close();
}
console.log(`Private evidence: ${evidence}`);
if (results.some(result => !result.passed)) process.exitCode = 1;
