import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hostFixture, until } from '../fixtures/host.mjs';

// Both experiences deliberately reuse this public definition and field names.
// Only their scene binding separates their records and playback controllers.
const scene = {
  initial: { v0: 30, a: 10, v: 30, x: 20, t: 0, score: 0, held: false },
  seed: 1,
  events: {
    tick: [
      { name: 'x', value: 'min(340, x + v * event.dt)' },
      { name: 'v', value: 'v + a * event.dt' },
      { name: 't', value: 't + event.dt' },
    ],
    reset: [{ name: 'v', value: 'v0' }],
    drag: [
      { name: 'x', value: 'event.phase == "move" ? min(340, max(20, x + event.dx)) : x' },
      { name: 'held', value: 'event.phase == "start" ? true : event.phase == "end" || event.phase == "cancel" ? false : held' },
    ],
    click: [{ name: 'score', value: 'score + 1' }],
    key: [{ name: 'score', value: 'score + (event.key == "Enter" || event.key == " " ? 1 : 0)' }],
  },
  marks: [
    { id: 'dot', type: 'circle', x: { expr: 'x' }, y: 70, r: 14, fill: 'blue', interactive: true, label: '可拖圆点' },
    { id: 'held', type: 'text', x: 16, y: 150, text: { expr: 'held ? "拖动中" : "已松开"' }, fill: 'gray' },
    { id: 'clock', type: 'text', x: 170, y: 150, text: { expr: 't' }, fill: 'gray' },
  ],
  width: 360,
  height: 180,
};
const fields = [
  { name: 'v0', label: '初速度', type: 'number', value: 30, min: 0, max: 120, step: 1 },
  { name: 'a', label: '加速度', type: 'number', value: 10, min: 0, max: 60, step: 1 },
];
const simulationMetrics = [{ label: '位置', formula: 'x', precision: 2 }, { label: '速度', formula: 'v', precision: 2 }];
const gameMetrics = [{ label: '得分', formula: 'score', precision: 0 }, { label: '当前速度', formula: 'v', precision: 2 }];
const source = `root = Stack([Simulation(${JSON.stringify(scene)},"controlsSimulation","参数模拟器",${JSON.stringify(fields)},${JSON.stringify(simulationMetrics)}),Game(${JSON.stringify(scene)},"controlsGame","参数小游戏","点击圆点或按回车得分，拖动圆点改变位置。",${JSON.stringify(fields)},${JSON.stringify(gameMetrics)})])`;
const stateURL = (session, block) => `/state?session=${encodeURIComponent(session)}&block=${encodeURIComponent(block)}`;
const dot = scope => scope.locator('[data-iui-mark-id="dot"]');
const input = (scope, label) => scope.getByLabel(label, { exact: true });
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const values = (record, bind) => record.state[bind].values;
const metric = (scope, label) => scope.locator('.iui-scene-metrics .iui-calculation-result').filter({ has: scope.page().getByText(label, { exact: true }) }).locator('.iui-result-value');

async function assertParameters(scope, v0, a) {
  assert.equal(await input(scope, '初速度').inputValue(), String(v0));
  assert.equal(await input(scope, '加速度').inputValue(), String(a));
}
async function advance(scope) {
  await scope.locator('.iui-scene-canvas').scrollIntoViewIfNeeded();
  const before = Number(await scope.locator('[data-iui-mark-id="clock"] text').textContent());
  await button(scope, '播放').click();
  await until(async () => Number(await scope.locator('[data-iui-mark-id="clock"] text').textContent()) >= before + 0.15);
  await button(scope, '暂停').click();
}
async function assertMetrics(scope, game) {
  const metrics = scope.locator('.iui-scene-metrics');
  assert.equal(await metrics.getAttribute('role'), game ? 'status' : 'group');
  assert.equal(await metrics.getAttribute('aria-live'), game ? 'polite' : null);
  assert.equal(await metrics.getAttribute('aria-atomic'), game ? 'true' : null);
  assert.equal(await metrics.locator('svg, output').count(), 0, 'metrics are outside the SVG; continuous simulation values have no implicit output live region');
  assert.equal(await metrics.evaluate(node => node.previousElementSibling?.classList.contains('iui-scene')), true, 'metrics sit next to the scene');
}

test('packaged native Web scene controls: parameter restart, game feedback, drag cancellation and isolated durable state stay local', { timeout: 300000 }, async t => {
  const f = await hostFixture(t, { reply: `模拟器和小游戏可以分别修改参数，重新开始会保留参数，重置会恢复所有初始设置。\n\n\`\`\`openui\n${source}\n\`\`\`` });
  const { page } = f;
  const health = await f.api('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.componentsVersion, 3, 'the actual installed package exposes the fields/metrics and restart contract');
  const { sessionId } = await f.rpc('session/create', { request: { workspaceId: f.workspace.workspace.workspaceId, agentPreset: 'intelligent-chat' } });
  await f.rpc('session/selectModel', { request: { sessionId, provider: 'fixture', model: 'fixture' } });
  await f.rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'IUI_NATIVE_SCENE_CONTROLS_PUBLIC_ACCEPTANCE' }], clientTimeZone: 'Asia/Shanghai' } });
  await until(async () => (await f.rpc('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId && !item.running && !item.blank));
  const sessionRow = () => page.locator(`[data-row-key="session:${sessionId}"]`);
  await sessionRow().click();
  const inline = page.locator('[data-iui-block]:not(.iui-artifact-pane [data-iui-block])').first();
  const simulation = inline.locator('.iui-simulation'), game = inline.locator('.iui-game');
  await simulation.locator('.iui-scene-canvas').waitFor();
  await game.locator('.iui-scene-canvas').waitFor();
  await until(async () => (await inline.innerText()).includes('已保存'));
  const block = await inline.getAttribute('data-iui-block');
  assert.match(block, /^\d+:\d+:\d+:\d+$/);
  const baselineRequests = f.requests.length, stages = [], records = {}, screenshots = [];
  const noteLocal = stage => {
    stages.push({ stage, requests: f.requests.length, localModelRequests: f.requests.length - baselineRequests });
    assert.equal(f.requests.length, baselineRequests, `${stage}: local controls never request a model response`);
  };
  const readSaved = predicate => until(async () => {
    const response = await f.api(stateURL(sessionId, block));
    assert.equal(response.status, 200);
    const sim = response.body.state.controlsSimulation?.values, gameState = response.body.state.controlsGame?.values;
    return sim && gameState && predicate(sim, gameState) ? response.body : false;
  });
  // No fallback evidence directory: all screenshots/results belong to the
  // central runner's explicitly designated directory, when one is provided.
  const evidence = process.env.IUI_SCENE_CONTROLS_EVIDENCE ? resolve(process.env.IUI_SCENE_CONTROLS_EVIDENCE) : null;
  if (evidence) await mkdir(evidence, { recursive: true, mode: 0o700 });
  const screenshot = async name => {
    if (!evidence) return;
    const path = join(evidence, name);await page.screenshot({ path, fullPage: true });screenshots.push(path);
  };
  await assertParameters(simulation, 30, 10);await assertParameters(game, 30, 10);
  await assertMetrics(simulation, false);await assertMetrics(game, true);
  assert.equal(await metric(game, '得分').textContent(), '0');noteLocal('initial controls and metric semantics');

  await input(simulation, '初速度').fill('60');await input(simulation, '加速度').fill('20');
  records.parameters = await readSaved((sim, other) => sim.v0 === 60 && sim.a === 20 && other.v0 === 30 && other.a === 10);
  await assertParameters(game, 30, 10);
  await advance(simulation);
  records.advanced = await readSaved(sim => sim.x > 20 && sim.t >= 0.15 && sim.v > 30);
  await button(simulation, '重新开始').click();
  records.restarted = await readSaved(sim => sim.v0 === 60 && sim.a === 20 && sim.x === 20 && sim.t === 0 && sim.v === 60 && !sim.held);
  assert.deepEqual(values(records.restarted, 'controlsGame'), scene.initial, 'simulation restart does not change the same-named game fields');
  assert.equal(records.restarted.state.controlsSimulation.seed, 1);
  assert.equal(await metric(simulation, '位置').textContent(), '20');
  assert.equal(await metric(simulation, '速度').textContent(), '60');noteLocal('simulation parameter-preserving restart');
  await button(simulation, '重置').click();
  records.reset = await readSaved(sim => Object.keys(scene.initial).every(key => Object.is(sim[key], scene.initial[key])));
  await assertParameters(simulation, 30, 10);
  assert.equal(records.reset.state.controlsSimulation.seed, 1);noteLocal('original full reset');

  // Playback is running until the real pointer starts a drag. Keep the mouse
  // pressed and keyboard-step a native number input to exercise parameter
  // cancellation without synthesizing pointer or visibility events.
  await simulation.locator('.iui-scene-canvas').scrollIntoViewIfNeeded();
  await button(simulation, '播放').click();
  await until(async () => Number(await simulation.locator('[data-iui-mark-id="clock"] text').textContent()) >= 0.15);
  const circle = await dot(simulation).locator('circle').boundingBox();
  assert.ok(circle, 'the real moving SVG point is visible');
  await page.mouse.move(circle.x + circle.width / 2, circle.y + circle.height / 2);await page.mouse.down();
  await simulation.getByText('拖动中', { exact: true }).waitFor();
  assert.equal(await dot(simulation).getAttribute('data-iui-dragging'), 'true');
  assert.equal(await button(simulation, '播放').isVisible(), true, 'claiming the pointer pauses playback');
  records.held = await readSaved(sim => sim.held);
  await input(simulation, '初速度').focus();
  assert.equal(await dot(simulation).getAttribute('data-iui-dragging'), 'true', 'moving keyboard focus alone does not cancel the pointer');
  await page.keyboard.press('ArrowUp');
  records.cancelled = await readSaved(sim => sim.v0 === 31 && !sim.held);
  assert.equal(await dot(simulation).getAttribute('data-iui-dragging'), null);
  assert.equal(await button(simulation, '播放').isVisible(), true);
  assert.equal(values(records.cancelled, 'controlsSimulation').t, values(records.held, 'controlsSimulation').t, 'parameter edits leave playback paused');
  assert.deepEqual(values(records.cancelled, 'controlsGame'), scene.initial);
  await page.mouse.up();
  await until(async () => (await inline.innerText()).includes('已保存'));
  assert.equal(await metric(game, '得分').textContent(), '0');
  records.released = await readSaved(sim => sim.v0 === 31 && !sim.held && sim.score === 0);
  assert.equal(await metric(simulation, '速度').textContent(), new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(values(records.cancelled, 'controlsSimulation').v));
  noteLocal('keyboard parameter edit cancels captured drag and keeps playback paused');

  await input(game, '初速度').fill('45');await input(game, '加速度').fill('5');
  await readSaved((sim, other) => sim.v0 === 31 && sim.a === 10 && other.v0 === 45 && other.a === 5);
  await assertParameters(simulation, 31, 10);
  await advance(game);
  await readSaved((sim, other) => other.x > 20 && other.t >= 0.15 && other.v > 30);
  await button(game, '重新开始').click();
  records.gameRestarted = await readSaved((sim, other) => other.v0 === 45 && other.a === 5 && other.v === 45 && other.x === 20 && other.t === 0 && other.score === 0);
  assert.deepEqual(values(records.gameRestarted, 'controlsSimulation'), values(records.released, 'controlsSimulation'));
  await dot(game).click();
  await until(async () => (await metric(game, '得分').textContent()) === '1');
  await dot(game).focus();await page.keyboard.press('Enter');
  await until(async () => (await metric(game, '得分').textContent()) === '2');
  records.scored = await readSaved((sim, other) => other.score === 2 && !other.held && sim.score === 0);
  assert.equal(await metric(game, '当前速度').textContent(), '45');
  await assertMetrics(game, true);noteLocal('game independent parameters, restart and external click/keyboard score');
  await screenshot('scene-controls-inline.png');

  await inline.getByRole('button', { name: '展开交互内容', exact: true }).click();
  const pane = page.locator('.iui-artifact-pane'), expanded = pane.locator('[data-iui-block]');
  const expandedSimulation = expanded.locator('.iui-simulation'), expandedGame = expanded.locator('.iui-game');
  await expandedGame.locator('.iui-scene-canvas').waitFor();
  assert.equal(await expanded.getAttribute('data-iui-block'), block);
  await assertParameters(expandedSimulation, 31, 10);await assertParameters(expandedGame, 45, 5);
  assert.equal(await metric(expandedGame, '得分').textContent(), '2');
  await input(expandedSimulation, '初速度').fill('50');await input(expandedSimulation, '加速度').fill('12');
  await until(async () => (await input(simulation, '初速度').inputValue()) === '50' && (await input(simulation, '加速度').inputValue()) === '12');
  await button(expandedSimulation, '重新开始').click();
  records.durable = await readSaved((sim, other) => sim.v0 === 50 && sim.a === 12 && sim.v === 50 && sim.x === 20 && sim.t === 0 && !sim.held && other.v0 === 45 && other.a === 5 && other.score === 2);
  assert.deepEqual(values(records.durable, 'controlsGame'), values(records.scored, 'controlsGame'));
  assert.equal(records.durable.componentsVersion, 3);
  await assertParameters(simulation, 50, 12);await assertParameters(game, 45, 5);
  await assertMetrics(expandedSimulation, false);await assertMetrics(expandedGame, true);
  assert.equal(await metric(simulation, '速度').textContent(), '50');
  await until(async () => (await expanded.innerText()).includes('已保存'));
  noteLocal('expanded shared state and independent same-named fields');
  await screenshot('scene-controls-expanded.png');

  const assertRestored = async () => {
    await simulation.locator('.iui-scene-canvas').waitFor();await game.locator('.iui-scene-canvas').waitFor();
    await until(async () => (await inline.innerText()).includes('已保存'));
    await assertParameters(simulation, 50, 12);await assertParameters(game, 45, 5);
    assert.equal(await metric(game, '得分').textContent(), '2');
    assert.equal(await metric(simulation, '位置').textContent(), '20');
    assert.equal(await metric(simulation, '速度').textContent(), '50');
    assert.equal(await button(simulation, '播放').isVisible(), true);
    assert.equal(await button(game, '播放').isVisible(), true);
    const response = await f.api(stateURL(sessionId, block));assert.equal(response.status, 200);
    assert.deepEqual(response.body.state, records.durable.state, 'all parameters, score, seeds and released gesture state restore exactly');
    return response.body;
  };
  await page.reload();records.reloaded = await assertRestored();noteLocal('page reload');
  await f.stop();await page.goto(await f.boot());await sessionRow().click();
  records.nativeRestarted = await assertRestored();
  assert.equal((await f.api('/health')).body.componentsVersion, 3);
  noteLocal('native process restart');assert.deepEqual(f.errors, []);
  await screenshot('scene-controls-restarted.png');
  if (evidence) await writeFile(join(evidence, 'scene-controls-result.json'), JSON.stringify({
    hostVersion: process.env.IUI_TEST_HOST_VERSION ?? health.body.hostVersion,
    health: health.body, packageSha256: createHash('sha256').update(await readFile(f.tar)).digest('hex'),
    sessionId, block, source, baselineRequests, finalRequests: f.requests.length,
    localModelRequests: f.requests.length - baselineRequests, stages, screenshots, records,
  }, null, 2), { mode: 0o600 });
});
