import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hostFixture, until } from '../fixtures/host.mjs';

const scene = {
  initial: { x: 80, y: 70, held: false, clicks: 0, keys: 0, ticks: 0, starts: 0, ends: 0, cancels: 0, phase: 'idle' },
  seed: 1,
  events: {
    drag: [
      { name: 'x', value: 'event.phase == "move" ? min(360, max(0, x + event.dx)) : x' },
      { name: 'y', value: 'event.phase == "move" ? min(240, max(0, y + event.dy)) : y' },
      { name: 'held', value: 'event.phase == "start" ? true : event.phase == "end" || event.phase == "cancel" ? false : held' },
      { name: 'starts', value: 'starts + (event.phase == "start" ? 1 : 0)' },
      { name: 'ends', value: 'ends + (event.phase == "end" ? 1 : 0)' },
      { name: 'cancels', value: 'cancels + (event.phase == "cancel" ? 1 : 0)' },
      { name: 'phase', value: 'event.phase' },
    ],
    click: [{ name: 'clicks', value: 'clicks + 1' }],
    key: [
      { name: 'x', value: 'min(360, max(0, x + (event.key == "ArrowRight" ? 10 : event.key == "ArrowLeft" ? -10 : 0)))' },
      { name: 'y', value: 'min(240, max(0, y + (event.key == "ArrowDown" ? 10 : event.key == "ArrowUp" ? -10 : 0)))' },
      { name: 'keys', value: 'keys + 1' },
    ],
    tick: [{ name: 'ticks', value: 'ticks + 1' }],
  },
  marks: [
    { id: 'dot', type: 'circle', x: { expr: 'x' }, y: { expr: 'y' }, r: 14, fill: 'blue', interactive: true, label: '可拖圆点' },
    { id: 'dotLabel', type: 'text', x: { expr: 'x - 8' }, y: { expr: 'y + 6' }, fontSize: 16, text: '移', fill: 'white' },
    { id: 'held', type: 'text', x: 16, y: 220, text: { expr: 'held ? "拖动中" : "已松开"' }, fill: 'gray' },
    { id: 'clock', type: 'text', x: 170, y: 220, text: { expr: 'concat("计时：", ticks)' }, fill: 'gray' },
  ],
  width: 900,
  height: 240,
};
const source = `root = Scene(${JSON.stringify(scene)},"dragDemo","拖拽本地交互验收")`;
const stateURL = (session, block) => `/state?session=${encodeURIComponent(session)}&block=${encodeURIComponent(block)}`;
const closeTo = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual} is within one SVG unit of ${expected}`);
const dot = scope => scope.locator('[data-iui-mark-id="dot"]');
async function assertPoint(scope, x, y) {
  const circle = dot(scope).locator('circle');
  closeTo(Number(await circle.getAttribute('cx')), x, 'rendered x');
  closeTo(Number(await circle.getAttribute('cy')), y, 'rendered y');
}
async function screenPoint(scope, x, y) {
  // Forward-map SVG units into actual CSS pixels, including host pane sizing,
  // preserveAspectRatio letterboxing and borders. Input remains real mouse input.
  return scope.locator('.iui-scene-canvas').evaluate((svg, point) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) throw Error('The actual native SVG has no screen transform');
    const mapped = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: mapped.x, y: mapped.y };
  }, { x, y });
}

test('packaged native Web drag: final deltas, shared expanded scene, cancel, keyboard and durable restart remain local', { timeout: 300000 }, async t => {
  const f = await hostFixture(t, { reply: `这是可以直接拖动的小圆点，也可以使用方向键。\n\n\`\`\`openui\n${source}\n\`\`\`\n\n播放只增加计时，不改变位置。` });
  const { page } = f;
  const health = await f.api('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.componentsVersion, 3, 'this real installed package exposes the new drag component contract');
  const { sessionId } = await f.rpc('session/create', { request: { workspaceId: f.workspace.workspace.workspaceId, agentPreset: 'intelligent-chat' } });
  await f.rpc('session/selectModel', { request: { sessionId, provider: 'fixture', model: 'fixture' } });
  await f.rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'IUI_NATIVE_SCENE_DRAG_PUBLIC_ACCEPTANCE' }], clientTimeZone: 'Asia/Shanghai' } });
  await until(async () => (await f.rpc('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId && !item.running && !item.blank));
  const sessionRow = () => page.locator(`[data-row-key="session:${sessionId}"]`);
  await sessionRow().click();
  const inline = page.locator('[data-iui-block]:not(.iui-artifact-pane [data-iui-block])').first();
  await inline.locator('.iui-scene-canvas').waitFor();
  await until(async () => (await inline.innerText()).includes('已保存'));
  const block = await inline.getAttribute('data-iui-block');
  assert.match(block, /^\d+:\d+:\d+:\d+$/);
  await assertPoint(inline, 80, 70);
  const baselineRequests = f.requests.length, stages = [];
  const noteLocal = stage => {
    stages.push({ stage, requests: f.requests.length, localModelRequests: f.requests.length - baselineRequests });
    assert.equal(f.requests.length, baselineRequests, `${stage}: local artwork operation never requests a model response`);
  };
  const readSaved = async predicate => until(async () => {
    const response = await f.api(stateURL(sessionId, block));
    assert.equal(response.status, 200);
    const values = response.body.state.dragDemo?.values;
    return values && predicate(values) ? response.body : false;
  });
  const near = (values, x, y) => Math.abs(values.x - x) <= 1 && Math.abs(values.y - y) <= 1;
  const evidence = resolve(process.env.IUI_DRAG_EVIDENCE ?? 'work/rea-parity/native/scene-drag');
  await mkdir(evidence, { recursive: true, mode: 0o700 });

  await inline.getByRole('button', { name: '播放', exact: true }).click();
  await until(async () => Number((await inline.locator('[data-iui-mark-id="clock"] text').textContent()).split('：')[1]) >= 2);
  await inline.locator('.iui-scene-canvas').scrollIntoViewIfNeeded();
  const start = await screenPoint(inline, 80, 70), finish = await screenPoint(inline, 200, 140);
  await page.mouse.move(start.x, start.y);await page.mouse.down();
  await inline.getByText('拖动中', { exact: true }).waitFor();
  assert.equal(await dot(inline).getAttribute('data-iui-dragging'), 'true');
  assert.equal(await inline.getByRole('button', { name: '播放', exact: true }).isVisible(), true, 'claiming the drag pauses real native playback');
  const held = await readSaved(values => values.held && values.starts === 1);
  await page.mouse.move(finish.x, finish.y, { steps: 9 });await page.mouse.up();
  const dragged = await readSaved(values => near(values, 200, 140) && !values.held && values.phase === 'end' && values.ends === 1);
  assert.equal(dragged.state.dragDemo.values.clicks, 0, 'dragging has no synthesized click side effect');
  assert.equal(dragged.state.dragDemo.values.ticks, held.state.dragDemo.values.ticks, 'dragging leaves the shared player paused');
  assert.equal(await dot(inline).getAttribute('data-iui-dragging'), null);
  await assertPoint(inline, 200, 140);noteLocal('inline drag and playback pause');
  const screenshots = [join(evidence, 'scene-drag-inline.png')];
  await page.screenshot({ path: screenshots[0], fullPage: true });

  await dot(inline).click();
  const tapped = await readSaved(values => values.clicks === 1 && values.starts === 2 && values.ends === 2 && !values.held);
  assert.ok(near(tapped.state.dragDemo.values, 200, 140), 'an ordinary paused tap still clicks without moving the point');
  noteLocal('paused tap');
  await inline.getByRole('button', { name: '展开交互内容', exact: true }).click();
  const pane = page.locator('.iui-artifact-pane'), expanded = pane.locator('[data-iui-block]');
  await expanded.locator('.iui-scene-canvas').waitFor();
  assert.equal(await expanded.getAttribute('data-iui-block'), block);
  await assertPoint(expanded, 200, 140);
  const originalSVG=await expanded.locator('.iui-scene-canvas').elementHandle();
  await expanded.getByRole('button',{name:'放大图形',exact:true}).click();
  const figureScroll=expanded.locator('.iui-figure-scroll');
  assert.equal(await figureScroll.getAttribute('data-original'),'true');
  assert.ok(Math.abs((await expanded.locator('.iui-scene-canvas').boundingBox()).width-scene.width)<=1,'magnified SVG uses its authored width');
  await figureScroll.focus();for(let step=0;step<3;step++)await page.keyboard.press('ArrowRight');
  await until(async()=>await figureScroll.evaluate(element=>element.scrollLeft)>0);
  assert.equal(await originalSVG.evaluate(element=>element.isConnected),true,'magnification keeps the live SVG mounted');
  assert.deepEqual((await f.api(stateURL(sessionId,block))).body.state,tapped.state,'view magnification and keyboard scrolling do not write scene data');
  noteLocal('narrow native figure magnification and keyboard horizontal scroll');
  await expanded.locator('.iui-scene-canvas').scrollIntoViewIfNeeded();
  const paneStart = await screenPoint(expanded, tapped.state.dragDemo.values.x, tapped.state.dragDemo.values.y);
  const paneFinish = await screenPoint(expanded, 230, 150);
  await page.mouse.move(paneStart.x, paneStart.y);await page.mouse.down();
  await expanded.getByText('拖动中', { exact: true }).waitFor();
  await page.mouse.move(paneFinish.x, paneFinish.y, { steps: 5 });await page.mouse.up();
  const expandedDrag = await readSaved(values => near(values, 230, 150) && !values.held && values.ends === 3);
  assert.equal(expandedDrag.state.dragDemo.values.clicks, 1, 'expanded dragging also suppresses its synthesized click');
  await assertPoint(inline, 230, 150);await assertPoint(expanded, 230, 150);
  await dot(expanded).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');
  const keyboard = await readSaved(values => near(values, 240, 160) && values.keys === 2 && !values.held);
  assert.equal(keyboard.state.dragDemo.values.clicks, 1);
  await assertPoint(inline, 240, 160);await assertPoint(expanded, 240, 160);noteLocal('expanded drag and shared keyboard state');
  screenshots.push(join(evidence, 'scene-drag-expanded.png'));
  await page.screenshot({ path: screenshots[1], fullPage: true });
  await expanded.getByRole('button',{name:'适应宽度',exact:true}).click();
  assert.equal(await originalSVG.evaluate(element=>element.isConnected),true);
  assert.equal(await figureScroll.getAttribute('data-original'),'false');

  // Keep the real mouse pressed while keyboard-activating the native artwork
  // close button. This verifies Scene unmount cancellation, not OS/window/tab
  // blur: Playwright's headless default focus emulation masks that stimulus.
  const cancelStart = await screenPoint(expanded, keyboard.state.dragDemo.values.x, keyboard.state.dragDemo.values.y);
  await page.mouse.move(cancelStart.x, cancelStart.y);await page.mouse.down();
  await expanded.getByText('拖动中', { exact: true }).waitFor();
  await pane.getByRole('button', { name: '关闭交互作品', exact: true }).focus();
  assert.equal(await dot(expanded).getAttribute('data-iui-dragging'), 'true', 'the drag remains captured until the native artwork is closed');
  await page.keyboard.press('Enter');await pane.waitFor({ state: 'detached' });
  const cancelled = await readSaved(values => values.phase === 'cancel' && values.cancels === 1 && !values.held && values.starts === 4);
  assert.equal(cancelled.state.dragDemo.values.ends, 3, 'unmount cancels instead of completing the held pointer gesture');
  await page.mouse.up();
  await inline.getByRole('button', { name: '展开交互内容', exact: true }).click();
  await expanded.locator('.iui-scene-canvas').waitFor();
  await expanded.getByText('已松开', { exact: true }).waitFor();
  await assertPoint(expanded, 240, 160);
  await until(async () => (await expanded.innerText()).includes('已保存'));
  const durable = (await f.api(stateURL(sessionId, block))).body;
  assert.equal(durable.componentsVersion, 3);
  assert.deepEqual(durable.state, cancelled.state);
  assert.equal(durable.state.dragDemo.values.clicks, 1, 'cancelled gesture and late mouseup never click');
  assert.ok(near(durable.state.dragDemo.values, 240, 160));noteLocal('native artwork close unmount cancellation and reopen');

  await page.reload();await inline.locator('.iui-scene-canvas').waitFor();
  await until(async () => (await inline.innerText()).includes('已保存'));
  await assertPoint(inline, 240, 160);await inline.getByText('已松开', { exact: true }).waitFor();
  const reloaded = (await f.api(stateURL(sessionId, block))).body;
  assert.deepEqual(reloaded.state, durable.state, 'reload restores the exact finalized native scene record');
  noteLocal('page reload');
  await f.stop();await page.goto(await f.boot());await sessionRow().click();
  await inline.locator('.iui-scene-canvas').waitFor();await until(async () => (await inline.innerText()).includes('已保存'));
  await assertPoint(inline, 240, 160);await inline.getByText('已松开', { exact: true }).waitFor();
  const restarted = (await f.api(stateURL(sessionId, block))).body;
  assert.deepEqual(restarted.state, durable.state, 'native process restart restores point, counters and released drag state');
  assert.equal((await f.api('/health')).body.componentsVersion, 3);
  noteLocal('native process restart');assert.deepEqual(f.errors, []);
  screenshots.push(join(evidence, 'scene-drag-restarted.png'));
  await page.screenshot({ path: screenshots[2], fullPage: true });
  await writeFile(join(evidence, 'scene-drag-result.json'), JSON.stringify({
    hostVersion: process.env.IUI_TEST_HOST_VERSION ?? health.body.hostVersion,
    health: health.body, packageSha256: createHash('sha256').update(await readFile(f.tar)).digest('hex'),
    sessionId, block, source, baselineRequests, finalRequests: f.requests.length,
    localModelRequests: f.requests.length - baselineRequests, stages, screenshots,
    heldRecord: held, draggedRecord: dragged, tappedRecord: tapped, expandedDragRecord: expandedDrag,
    keyboardRecord: keyboard, cancelledRecord: cancelled, reloadedRecord: reloaded, restartedRecord: restarted,
  }, null, 2), { mode: 0o600 });
});
