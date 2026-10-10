import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

let browser, script;
before(async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../fixtures/host-adapter/browser.jsx', import.meta.url))],
    bundle: true, format: 'iife', platform: 'browser', jsx: 'transform', keepNames: true, write: false });
  script = bundle.outputFiles[0].text;
  browser = await chromium.launch({ headless: true, ...(process.env.CFT_EXECUTABLE ? { executablePath: process.env.CFT_EXECUTABLE } : {}), args: ['--use-mock-keychain','--password-store=basic'] });
});
after(async () => { await browser?.close(); });

for (const host of ['rc2', 'alpha1', 'alpha2']) {
  test(`${host} exact native renderer excerpts preserve hooks, disclosure, grouping, images, file mentions and stop through streaming UI transitions`, async () => {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<div id="root"></div><div id="entrance"></div>');
    await page.evaluate(version => { window.hostVersion = version; window.minifyNativeNames = true; }, host);
    await page.addScriptTag({ content: script });
    await page.locator('.native-reasoning-toggle').click();
    assert.equal(await page.locator('.native-reasoning').getAttribute('data-expanded'), 'true');
    if (host === 'alpha2') assert.deepEqual(await page.evaluate(() => window.reasoningSlotCalls.map(item => item.name)), ['conversation.chat.reasoning.body']);
    assert.equal(await page.locator('.iui-surface').count(), 0);
    const prefix = 'Some native prose.\n\n```openui\n';
    await page.evaluate(text => window.updateResponse({ text }), prefix);
    await page.waitForSelector('.iui-surface');
    assert.equal(await page.locator('.iui-surface').getAttribute('data-block'), '4:2:2:0');
    assert.equal(await page.locator('.iui-surface').getAttribute('data-streaming'), 'true');
    assert.equal(await page.locator('.native-reasoning').getAttribute('data-expanded'), 'true');
    await page.evaluate(text => window.updateResponse({ text }), prefix + 'root = Text("first")\n```\n\nNative trailing prose.\n\n```openui\nroot = Text("second")\n```');
    await page.waitForFunction(() => document.querySelectorAll('.iui-surface').length === 2);
    assert.deepEqual(await page.locator('.iui-surface').evaluateAll(rows => rows.map(row => row.dataset.block)), ['4:2:2:0', '4:2:2:1']);
    assert.equal(await page.locator('.iui-surface button').first().isDisabled(), true);
    assert.equal(await page.locator('[data-native-images]').textContent(), 'image1,image2');
    assert.match(await page.locator('[data-native-unknown]').textContent(), /native unknown/);
    await page.evaluate(() => window.updateResponse({ status: 'settled' }));
    await page.waitForFunction(() => document.querySelector('.iui-surface').dataset.streaming === 'false');
    assert.equal(await page.locator('.native-markdown[data-mentions="present"]').count(), 2);
    await page.getByRole('button', { name: '提交交互' }).first().click();
    await page.getByRole('button', { name: '展开作品' }).first().click();
    assert.deepEqual(await page.evaluate(() => window.submissions), [['session-alpha', '4:2:2:0', 'submitted fields']]);
    assert.equal(await page.evaluate(() => window.expands[0].sessionId), 'session-alpha');
    await page.evaluate(() => window.updateResponse({ processOpen: false }));
    await page.waitForSelector('[data-turn-process-inline][hidden="until-found"]', { state: 'attached' });
    await page.locator('[data-turn-process-inline]').evaluate(element => element.dispatchEvent(new Event('beforematch')));
    await page.waitForSelector('[data-turn-process-inline]', { state: 'detached' });
    await page.evaluate(() => window.updateResponse({ groupPart: 'reasoning' }));
    await page.waitForFunction(() => document.querySelectorAll('.iui-surface').length === 0);
    assert.equal(await page.locator('.native-reasoning').count(), 1);
    assert.equal(await page.locator('[data-native-images]').count(), 0);
    await page.evaluate(() => window.updateResponse({ groupPart: 'response', status: 'interrupted' }));
    await page.waitForSelector('.native-stopped');
    assert.equal(await page.locator('.native-reasoning').count(), 0);
    assert.equal(await page.locator('.native-stopped').textContent(), '已停止');
    await page.evaluate(() => window.updateResponse({ text: 'ordinary answer after reset', status: 'settled', groupPart: undefined }));
    await page.waitForFunction(() => document.querySelectorAll('.iui-surface').length === 0);
    assert.equal(await page.locator('.native-markdown[data-path-images="present"]').textContent(), 'ordinary answer after reset');
    assert.deepEqual(await page.evaluate(() => window.adapterDiagnostics), []);
    assert.deepEqual(errors, []); await page.close();
  });
}

test('hover chat seats float inside the full native row, preserve actions and keyboard order, handle rail/chrome and fully clean up', async () => {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent(`<style>.sidebar{width:240px;display:flex;flex-direction:column;padding:12px}.abc_newSession{height:38px;margin:0 2px 12px;flex:none}.chrome{display:flex;gap:8px}.abc_iconButton{width:28px;height:28px}</style>
    <div class="sidebar" id="sidebar"><button class="abc_brand" aria-label="新建会话">品牌</button><button class="abc_newSession" aria-label="新建会话" aria-keyshortcuts="Meta+n" onclick="window.originalClicks++">普通新会话<span class="abc_newSessionShortcut" aria-hidden="true">⌘N</span></button></div>
    <div class="chrome"><button class="abc_iconButton" aria-label="New session" onclick="window.originalClicks++">N</button></div><div id="root"></div><div id="entrance"></div>`);
  const nativeWidth=(await page.locator('.abc_newSession').boundingBox()).width;
  await page.addScriptTag({ content: script }); await page.evaluate(() => window.mountEntrance());
  await page.waitForFunction(() => document.querySelectorAll('.iui-new-session-plus').length === 2);
  assert.equal(await page.locator('.abc_brand + .iui-new-session-seat').count(), 0);
  assert.equal(await page.locator('.abc_newSession + .iui-new-session-seat').count(), 1);
  assert.equal((await page.locator('.abc_newSession').boundingBox()).width,nativeWidth,'the original new-session row keeps its full width');
  const wideSeat=page.locator('#sidebar .iui-new-session-seat');
  assert.equal(await wideSeat.evaluate(element=>getComputedStyle(element).pointerEvents),'none');
  await page.locator('.abc_newSession').hover();
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#sidebar .iui-new-session-seat')).opacity)>.99);
  assert.equal(await page.locator('.abc_newSessionShortcut').evaluate(element=>getComputedStyle(element).visibility),'hidden','the native decorative shortcut yields the right slot to Chat');
  assert.equal(await page.locator('.abc_newSession').getAttribute('aria-keyshortcuts'),'Meta+n');
  const boxes = await page.locator('#sidebar').evaluate(element => {
    const native = element.querySelector('.abc_newSession').getBoundingClientRect();
    const plus = element.querySelector('.iui-new-session-plus').getBoundingClientRect();
    return { nativeLeft:native.left,nativeWidth:native.width,nativeRight: native.right, plusLeft: plus.left,plusRight:plus.right, nativeY: native.y, plusY: plus.y };
  });
  assert.ok(boxes.plusLeft>=boxes.nativeLeft+boxes.nativeWidth/2&&boxes.plusRight<=boxes.nativeRight);
  assert.ok(Math.abs(boxes.plusY - boxes.nativeY) < 8);
  await wideSeat.hover();assert.equal(await wideSeat.evaluate(element=>getComputedStyle(element).pointerEvents),'auto','entering the chat affordance keeps it revealed');
  await page.locator('.abc_newSession').click(); assert.equal(await page.evaluate(() => window.originalClicks), 1);
  await page.locator('.abc_newSession').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('iui-new-session-chat')), true);
  await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => window.entranceCreationCount()), 1);
  await page.evaluate(() => window.setEntranceBusy(true));
  await page.waitForFunction(() => document.querySelector('.iui-new-session-plus').disabled);
  assert.equal(await page.locator('.abc_newSession').isDisabled(), false);
  await page.locator('#sidebar').evaluate(element => { element.style.width = '56px'; element.querySelector('.abc_newSession').style.width = '36px'; });
  await page.waitForFunction(() => !document.querySelector('.abc_newSession').hasAttribute('data-iui-entrance-wide'));
  assert.equal(await page.locator('#sidebar .iui-new-session-seat').evaluate(element => getComputedStyle(element).position), 'static');
  assert.equal(await page.locator('.abc_newSessionShortcut').evaluate(element=>getComputedStyle(element).visibility),'visible');
  await page.locator('#sidebar').evaluate(element=>{element.style.width='240px';element.querySelector('.abc_newSession').style.removeProperty('width');});
  await page.waitForFunction(()=>document.querySelector('.abc_newSession').hasAttribute('data-iui-entrance-wide'));
  assert.equal(await page.locator('.abc_newSessionShortcut').evaluate(element=>getComputedStyle(element).visibility),'hidden');
  await page.evaluate(() => window.unmountEntrance());
  assert.equal(await page.locator('.iui-new-session-seat').count(), 0);
  assert.equal(await page.locator('[data-iui-entrance-wide]').count(), 0);
  assert.equal(await page.locator('.abc_newSessionShortcut').evaluate(element=>getComputedStyle(element).visibility),'visible','uninstall restores the native shortcut');
  await page.locator('.abc_newSession').click(); assert.equal(await page.evaluate(() => window.originalClicks), 2);
  await page.locator('.chrome').evaluate(element => { element.innerHTML = '<button class="abc_iconButton" aria-label="New session">New</button>'; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await page.locator('.iui-new-session-seat').count(), 0);
  assert.deepEqual(errors, []); await page.close();
});

test('artifact native tab pins session/block, updates streaming source, restores authenticated source and releases pending reads', async () => {
  const page = await browser.newPage();
  await page.route('http://intelligent-ui.test/**', route => route.fulfill({ body: '<div id="root"></div><div id="entrance"></div><div id="artifact"></div>', contentType: 'text/html' }));
  await page.goto('http://intelligent-ui.test/'); await page.addScriptTag({ content: script });
  await page.evaluate(() => window.mountArtifact());
  await page.waitForSelector('.iui-artifact-placeholder');
  const item = { source: 'root = Text("artifact")', streaming: true, sessionId: 'session-alpha', blockId: '4:2:2:0' };
  await page.evaluate(record => window.expandArtifact(record), item);
  await page.waitForSelector('#artifact .iui-surface');
  assert.deepEqual(await page.evaluate(() => window.artifactOpens), [{ kind: 'intelligent-ui-artifact', options: { params: { blockId: '4:2:2:0' } } }]);
  assert.equal(await page.locator('#artifact .iui-surface').getAttribute('data-streaming'), 'true');
  await page.evaluate(record => window.updateArtifact(record), { ...item, source: 'root = Text("settled")', streaming: false });
  await page.waitForFunction(() => document.querySelector('#artifact .iui-surface').dataset.streaming === 'false');
  await page.locator('#artifact button', { hasText: '提交交互' }).click();
  assert.deepEqual(await page.evaluate(() => window.submissions), [['session-alpha', '4:2:2:0', 'submitted fields', { signal: {} }]]);
  const stale = await page.evaluate(record => { window.artifactSelected = 'elsewhere'; try { window.expandArtifact(record); return null; } catch (error) { return error.message; } }, item);
  assert.match(stale, /所属会话/); assert.equal(await page.evaluate(() => window.artifactOpens.length), 1);
  await page.evaluate(() => { window.unmountArtifact(); window.artifactSelected = 'session-alpha';
    window.fetch = async (url, { signal }) => { window.restoredArtifactURL = url; window.restoreSignal = signal;
      return { ok: true, json: async () => ({ source: 'root = Text("restored")' }) }; };
    window.mountArtifact(); });
  await page.waitForFunction(() => document.querySelector('#artifact .iui-surface')?.dataset.source.includes('restored'));
  assert.match(await page.evaluate(() => window.restoredArtifactURL), /^intelligent-ui\/api\/state\?session=session-alpha&block=4%3A2%3A2%3A0$/);
  assert.deepEqual(await page.evaluate(() => window.artifactDisposals), ['body', 'type']);
  await page.evaluate(() => window.unmountArtifact());
  assert.equal(await page.locator('#artifact .iui-surface').count(), 0);
  assert.equal(await page.evaluate(() => window.restoreSignal.aborted), true);
  await page.close();
});
