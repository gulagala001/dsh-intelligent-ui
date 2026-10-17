import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hostFixture, until } from '../fixtures/host.mjs';

const gate = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const form = (title, button) => `root = Form(${JSON.stringify(title)},[{name:"note",label:"说明",type:"text"}],[],${JSON.stringify(button)},"IUI_NATIVE_SUBMIT")`;
const sourceA = form('原生回答甲', '发送甲'), sourceB = form('原生回答乙', '发送乙');
const textOf = content => (content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
const requestOf = body => body.payload.args.request;
const requestIdOf = message => message.source?.rpcId;
const inboxMessages = snapshot => {
  const inbox = snapshot.projections.values.inbox;
  return [...(inbox?.['next-turn'] ?? []), ...(inbox?.['next-step'] ?? [])];
};

test('packaged native queue preserves concurrent answer intents across held receipts, rejection, navigation and restart', { timeout: 300000 }, async t => {
  const modelGate = gate(), firstReceipt = gate(), failedReceipt = gate(), navigationGate = gate();
  t.after(() => { modelGate.resolve(); firstReceipt.resolve(); failedReceipt.resolve(); navigationGate.resolve(); });
  let modelHeld = false, setupDelivered = false;
  const f = await hostFixture(t, { reply: async function* (payload) {
    if (!payload.tools?.length) { yield { delta: { content: '原生并发验收' }, finish_reason: 'stop' }; return; }
    const messages = JSON.stringify(payload.messages);
    if (messages.includes('IUI_NATIVE_SETUP_OLD_DATA') && !setupDelivered) {
      setupDelivered = true;
      yield { delta: { content: `保留原生旧会话。\n\n\`\`\`openui\n${sourceA}\n\`\`\`\n\n\`\`\`openui\n${sourceB}\n\`\`\`` }, finish_reason: 'stop' }; return;
    }
    if (messages.includes('CLICK-A') && !modelHeld) {
      modelHeld = true; yield { delta: { role: 'assistant', content: '原生第一条运行中。' } }; await modelGate.promise;
    }
    yield { delta: { content: '原生独立提交已处理。' }, finish_reason: 'stop' };
  } });
  const create = async text => {
    const { sessionId } = await f.rpc('session/create', { request: { workspaceId: f.workspace.workspace.workspaceId, agentPreset: 'intelligent-chat' } });
    await f.rpc('session/selectModel', { request: { sessionId, provider: 'fixture', model: 'fixture' } });
    await f.rpc('session/prompt', { request: { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: 'UTC' } });
    await until(async () => !(await f.rpc('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId)?.running);
    return sessionId;
  };
  const sessionId = await create('IUI_NATIVE_SETUP_OLD_DATA'), otherId = await create('IUI_OTHER_SESSION_OLD_DATA');
  const { page } = f, submissions = [], routeErrors = [];
  let firstId, firstHostAccepted = false, firstBrowserReceiptReleased = false, failedId, navigationId;
  await page.route('**/api/session/prompt', async route => {
    try {
      const body = route.request().postDataJSON(), request = requestOf(body), text = textOf(request.content);
      submissions.push({ sessionId: request.sessionId, requestId: request.requestId, text, mode: request.mode });
      if (text.includes('NAVIGATION-CANCEL')) {
        navigationId = request.requestId; await navigationGate.promise;
        await route.abort('aborted').catch(() => {}); return;
      }
      if (text.includes('NATIVE-REFUSAL')) {
        failedId = request.requestId; request.clientTimeZone = 'IUI/Invalid-Time-Zone';
        const response = await route.fetch({ postData: JSON.stringify(body) });
        const result = await response.json();
        assert.equal(result.result.ok, false); assert.equal(result.result.error.code, 'session/invalid-time-zone');
        await failedReceipt.promise; await route.fulfill({ response }); return;
      }
      const response = await route.fetch(), result = await response.json();
      assert.equal(result.result.ok, true, JSON.stringify(result));
      if (!firstId && text.includes('CLICK-A')) {
        firstId = request.requestId; firstHostAccepted = true;
        await firstReceipt.promise; firstBrowserReceiptReleased = true;
      }
      await route.fulfill({ response });
    } catch (error) { routeErrors.push(error.message); await route.abort().catch(() => {}); }
  });
  await page.locator(`[data-row-key="session:${sessionId}"]`).click();
  const first = page.locator('.iui-surface').filter({ has: page.getByRole('button', { name: '发送甲', exact: true }) }).first();
  const second = page.locator('.iui-surface').filter({ has: page.getByRole('button', { name: '发送乙', exact: true }) }).first();
  await first.getByRole('textbox', { name: '说明', exact: true }).waitFor();
  await until(() => first.getByRole('textbox', { name: '说明', exact: true }).isEnabled());
  await first.getByRole('button', { name: '展开交互内容', exact: true }).click();
  const pane = page.locator('.iui-artifact-pane'); await pane.getByRole('button', { name: '发送甲', exact: true }).waitFor();
  await first.getByRole('textbox', { name: '说明', exact: true }).fill('CLICK-A');
  await first.getByRole('button', { name: '发送甲', exact: true }).click();
  await until(() => firstHostAccepted && modelHeld);
  await pane.getByRole('button', { name: '发送甲', exact: true }).click();
  assert.equal(submissions.length, 1, 'inline and native expanded view share one exact-block intent while its receipt is held');
  await second.getByRole('textbox', { name: '说明', exact: true }).fill('CLICK-A');
  await second.getByRole('button', { name: '发送乙', exact: true }).click();
  await pane.getByRole('textbox', { name: '说明', exact: true }).fill('CLICK-B');
  await pane.getByRole('button', { name: '发送甲', exact: true }).click();
  await until(() => submissions.length === 3);
  const independentlyQueued = await until(async () => {
    const value = await f.snapshot(sessionId), ids = new Set(inboxMessages(value).map(requestIdOf));
    return submissions.slice(1, 3).every(item => ids.has(item.requestId)) && value;
  });
  assert.equal(firstBrowserReceiptReleased, false, 'the actual host admits both independent intents before the first browser receipt');
  assert.equal(submissions[0].text, submissions[1].text, 'same content from another answer block is independent');
  assert.notEqual(submissions[0].text, submissions[2].text, 'new content from the first answer block is independent');
  assert.equal(new Set(submissions.map(item => item.requestId)).size, 3);
  await pane.getByRole('textbox', { name: '说明', exact: true }).fill('LATER-UNSUBMITTED-EDIT');
  assert.match(submissions[2].text, /CLICK-B/); assert.ok(!submissions[2].text.includes('LATER-UNSUBMITTED-EDIT'));
  await second.getByRole('textbox', { name: '说明', exact: true }).fill('NATIVE-REFUSAL');
  await second.getByRole('button', { name: '发送乙', exact: true }).click();
  await until(() => failedId);
  await second.getByRole('textbox', { name: '说明', exact: true }).fill('AFTER-REFUSAL');
  await second.getByRole('button', { name: '发送乙', exact: true }).click();
  await until(() => submissions.length === 5);
  const afterRefusalId = submissions[4].requestId;
  await until(async () => inboxMessages(await f.snapshot(sessionId)).some(message => requestIdOf(message) === afterRefusalId));
  failedReceipt.resolve();
  await second.getByRole('alert').filter({ hasText: 'clientTimeZone' }).waitFor();
  assert.equal(await first.getByRole('alert').count(), 0, 'the rejected native request is reported only on its submitting block');
  firstReceipt.resolve(); modelGate.resolve();
  await until(async () => !(await f.rpc('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId)?.running);

  await page.getByRole('button', { name: '关闭交互作品', exact: true }).click();
  await second.getByRole('textbox', { name: '说明', exact: true }).fill('NAVIGATION-CANCEL');
  await second.getByRole('button', { name: '发送乙', exact: true }).click();
  await until(() => navigationId);
  const aborted = page.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/api/session/prompt') && requestOf(request.postDataJSON()).requestId === navigationId, timeout: 5000 });
  await page.locator(`[data-row-key="session:${otherId}"]`).click();
  await aborted; navigationGate.resolve();
  await page.locator(`[data-row-key="session:${sessionId}"]`).click();
  await second.getByRole('textbox', { name: '说明', exact: true }).waitFor();
  await until(() => second.getByRole('textbox', { name: '说明', exact: true }).isEnabled());
  await second.getByRole('textbox', { name: '说明', exact: true }).fill('AFTER-NAVIGATION');
  await second.getByRole('button', { name: '发送乙', exact: true }).click();
  await until(() => submissions.length === 7);
  await until(async () => !(await f.rpc('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId)?.running);
  await until(async () => (await second.innerText()).includes('已保存') && (await first.innerText()).includes('已保存'));
  const blockA = await first.getAttribute('data-iui-block'), blockB = await second.getAttribute('data-iui-block');
  const state = await f.api(`/state?session=${sessionId}&block=${blockB}`); assert.equal(state.status, 200);
  assert.equal(state.body.state.note, 'AFTER-NAVIGATION');
  await f.stop();
  const durable = await f.persistedSession(sessionId), otherDurable = await f.persistedSession(otherId);
  const events = durable.rows.filter(row => row.type === 'user/message');
  const accepted = submissions.filter(item => ![failedId, navigationId].includes(item.requestId));
  for (const item of accepted) {
    const matches = events.filter(event => event.data.source.rpcId === item.requestId);
    assert.equal(matches.length, 1, 'one durable user/message per accepted native queue request');
    assert.equal(textOf(matches[0].data.content), item.text);
  }
  assert.equal(events.some(event => [failedId, navigationId].includes(event.data.source?.rpcId)), false);
  assert.ok(durable.text.includes('IUI_NATIVE_SETUP_OLD_DATA')); assert.ok(otherDurable.text.includes('IUI_OTHER_SESSION_OLD_DATA'));
  for (const item of submissions) assert.ok(!otherDurable.text.includes(item.requestId), 'no accepted, rejected or canceled intent migrates to the other session');
  await page.goto(await f.boot()); await page.locator(`[data-row-key="session:${sessionId}"]`).click();
  await second.getByRole('textbox', { name: '说明', exact: true }).waitFor();
  await until(() => second.getByRole('textbox', { name: '说明', exact: true }).isEnabled());
  assert.equal(await second.getByRole('textbox', { name: '说明', exact: true }).inputValue(), 'AFTER-NAVIGATION');
  assert.equal(await first.getByRole('textbox', { name: '说明', exact: true }).inputValue(), 'LATER-UNSUBMITTED-EDIT');
  assert.deepEqual(f.errors, []); assert.deepEqual(routeErrors, []);
  const directory = resolve(process.env.IUI_NATIVE_SUBMIT_EVIDENCE ?? 'work/native-submit-concurrency');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await page.screenshot({ path: join(directory, 'native-submit-concurrency.png'), fullPage: true });
  await writeFile(join(directory, 'native-submit-concurrency.result.json'), JSON.stringify({ ranAt: new Date().toISOString(),
    actualHostVersion: JSON.parse(await readFile(join(resolve('node_modules/@deepseek-ai/dsh'), 'package.json'), 'utf8')).version,
    packageSHA256: createHash('sha256').update(await readFile(f.tar)).digest('hex'), sessionId, otherId, blockA, blockB, submissions,
    realDSHHostStarted: true, syntheticModel: true, realWebClicked: true, firstReceiptHeld: true,
    independentNativeQueueIds: inboxMessages(independentlyQueued).map(requestIdOf), acceptedDurableRequestIds: accepted.map(item => item.requestId),
    rejectionCode: 'session/invalid-time-zone', canceledBeforeHostAdmission: navigationId, nativeOldDataRetained: true,
    restartRestoredDraft: true, noCrossSessionOwnership: true, routeErrors, pageErrors: f.errors }, null, 2) + '\n', { mode: 0o600 });
});
