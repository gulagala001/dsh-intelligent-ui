import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { until } from '../fixtures/host.mjs';
import { transactionHost, source, originalRows, reorderedRows, duplicateRows, legacyState, legacyPicked, unrelated, parsePayload } from '../fixtures/table-selection-transaction.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const textOf = content => (content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
const selectedRecord = state => state.picked?.selected == null ? null : state.records[state.picked.selected];
const assertCleared = state => {
  assert.equal(state.picked.selected, null); assert.equal(state.picked.selectedIdentity, null); assert.equal(state.picked.selectedTransient, null);
  assert.equal(state.picked.sort, legacyPicked.sort); assert.equal(state.picked.direction, legacyPicked.direction);
  assert.deepEqual(state.picked.privateExtra, legacyPicked.privateExtra); assert.deepEqual(state.unrelated, unrelated);
};

test('packaged native Table transactions submit reconciled selection synchronously and retain legacy state across reopen', { timeout: 300000 }, async t => {
  const files = ['lib/client.js', 'src/client/document-store.mjs', 'src/client/components/data.jsx', 'src/runtime/table-selection.mjs', 'src/runtime/evaluate.mjs'];
  const sourceSHA256 = Object.fromEntries(await Promise.all(files.map(async file => [file, digest(await readFile(file))])));
  if (process.env.IUI_TABLE_TRANSACTION_CLIENT_SHA) assert.equal(sourceSHA256['lib/client.js'], process.env.IUI_TABLE_TRANSACTION_CLIENT_SHA);
  let f;
  const submissions = [], frames = [], accepted = [], stages = [];
  const directory = process.env.IUI_TABLE_TRANSACTION_EVIDENCE ? resolve(process.env.IUI_TABLE_TRANSACTION_EVIDENCE) : null;
  let passed = false;
  t.after(async () => {
    if (passed || !directory) return;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await f?.page.screenshot({ path: join(directory, 'table-selection-transaction-failure.png'), fullPage: true }).catch(() => {});
    let nativeMessages = [], captureFailure;
    if (f && stages[0]?.sessionId) {
      try {
        await f.stop();
        const durable = await f.persistedSession(stages[0].sessionId);
        nativeMessages = durable.rows.filter(row => row.type === 'user/message' && row.data.source?.kind === 'user' && typeof row.data.source.rpcId === 'string')
          .map(row => ({ requestId: row.data.source.rpcId, text: textOf(row.data.content) }));
      } catch (error) { captureFailure = error.message; }
    }
    await writeFile(join(directory, 'table-selection-transaction-red.result.json'), JSON.stringify({ ranAt: new Date().toISOString(), passed: false,
      mode: 'controlled synthetic model replay', realModelCalled: false, sourceSHA256, stages, submissions, frames, nativeMessages, captureFailure }, null, 2) + '\n', { mode: 0o600 });
  });
  f = await transactionHost(t); const { page } = f;
  const { sessionId } = await f.rpc('session/create', { request: { workspaceId: f.workspace.workspace.workspaceId, agentPreset: 'intelligent-chat' } });
  stages.push({ stage: 'created', sessionId });
  await f.rpc('session/selectModel', { request: { sessionId, provider: 'fixture', model: 'fixture' } });
  const seedRequestId = crypto.randomUUID();
  await f.rpc('session/prompt', { request: { requestId: seedRequestId, sessionId, mode: 'queue', content: [{ type: 'text', text: 'TABLE_NATIVE_LEGACY_SESSION' }], clientTimeZone: 'UTC' } });
  const idle = () => until(async () => !(await f.rpc('session/list', { _request: {} })).items.find(item => item.sessionId === sessionId)?.running);
  await until(() => f.modelTurns === 1); await idle();
  const sessionRow = () => page.locator(`[data-row-key="session:${sessionId}"]`); await sessionRow().click();
  const surface = page.locator('.iui-surface').filter({ has: page.getByRole('button', { name: '重排并提交', exact: true }) }).first();
  const button = name => surface.getByRole('button', { name, exact: true });
  await button('重排并提交').waitFor(); await until(() => button('重排并提交').isEnabled());
  const block = await surface.getAttribute('data-iui-block'), stateURL = `/state?session=${sessionId}&block=${block}`;
  const current = await f.api(stateURL); assert.equal(current.status, 200);
  const seeded = await f.api('/state', { session: sessionId, block, source: current.body.source ?? source + '\n', sourceRevision: current.body.sourceRevision,
    expectedRevision: current.body.revision, state: structuredClone(legacyState) });
  assert.equal(seeded.status, 200); assert.deepEqual(seeded.body.state, legacyState, 'the native writer saves the exact old numeric selected and unrelated fields');
  await page.reload(); await until(async () => await surface.getAttribute('aria-busy') === 'false');
  assert.deepEqual((await f.api(stateURL)).body.state.picked, legacyPicked);
  await surface.getByText('当前：甲', { exact: true }).waitFor(); assert.match(await surface.locator('tr.is-selected').innerText(), /甲/);
  stages.push({ stage: 'legacy-hydrated', selected: '甲', state: seeded.body.state });
  page.on('request', request => {
    if (!request.url().endsWith('/api/session/prompt')) return;
    const value = request.postDataJSON().payload.args.request;
    submissions.push({ requestId: value.requestId, sessionId: value.sessionId, mode: value.mode, text: textOf(value.content) });
  });
  const captureFrames = async () => page.evaluate(block => {
    window.tableTransactionFrames = [];
    const capture = stage => {
      const surface = document.querySelector(`[data-iui-block="${block}"]`);
      window.tableTransactionFrames.push({ stage, text: surface.innerText, selected: [...surface.querySelectorAll('tr.is-selected')].map(row => row.innerText) });
    };
    document.addEventListener('click', event => {
      if (event.target.closest('button')?.textContent.trim() !== '重排并提交') return;
      queueMicrotask(() => capture('after-native-click-microtask'));
      requestAnimationFrame(() => capture('first-render-frame'));
    });
  }, block);
  await captureFrames();
  const submit = async (name, count, scope = surface) => {
    const responded = page.waitForResponse(response => response.url().endsWith('/api/session/prompt') && response.request().postDataJSON().payload.args.request.sessionId === sessionId);
    await scope.getByRole('button', { name, exact: true }).click(); const response = await responded; const result = await response.json(); assert.equal(result.result.ok, true);
    await until(() => submissions.length === count && f.modelTurns === count + 1); await idle();
    accepted.push(submissions.at(-1).requestId); const payload = parsePayload(submissions.at(-1).text); stages.push({ stage: name, payload }); return payload;
  };
  await surface.getByRole('tab', { name: '说明', exact: true }).click();
  const first = await submit('重排并提交', 1); assert.deepEqual(first.records, reorderedRows); assertCleared(first); assert.equal(selectedRecord(first), null);
  await surface.getByText('当前：无', { exact: true }).waitFor();
  const initialFrames = await page.evaluate(() => window.tableTransactionFrames); frames.push(...initialFrames);
  assert.equal(initialFrames.length, 2); for (const frame of initialFrames) { assert.match(frame.text, /当前：无/); assert.ok(!frame.text.includes('当前：丙')); assert.deepEqual(frame.selected, []); }
  assert.equal(await surface.locator('tr.is-selected').count(), 0);
  await surface.getByRole('tab', { name: '记录', exact: true }).click();
  await button('选择第 2 行').click(); await surface.getByText('当前：甲', { exact: true }).waitFor();
  const explicit = await submit('提交当前', 2); assert.equal(explicit.picked.selected, 1); assert.equal(selectedRecord(explicit).id, 'a'); assert.equal(selectedRecord(explicit).name, '甲');
  assert.equal(typeof explicit.picked.selectedIdentity, 'string'); assert.deepEqual(explicit.picked.privateExtra, legacyPicked.privateExtra);
  const beforeLocal = f.modelTurns; await button('载入重复行').click(); await surface.getByText('当前：无', { exact: true }).waitFor();
  assert.equal(f.modelTurns, beforeLocal); assert.equal(submissions.length, 2);
  await button('展开交互内容').click(); const pane = page.locator('.iui-artifact-pane'); await pane.getByRole('button', { name: '选择第 2 行', exact: true }).waitFor();
  assert.equal(await page.locator(`[data-iui-block="${block}"]`).count(), 2, 'inline and expanded physical Surfaces share the same document during the duplicate gesture');
  await pane.getByRole('button', { name: '选择第 2 行', exact: true }).click();
  stages.push({ stage: 'expanded-duplicate-gesture', inlineText: await surface.innerText(), expandedText: await pane.innerText(), expandedPressed: await pane.getByRole('button', { name: '选择第 2 行', exact: true }).getAttribute('aria-pressed') });
  const duplicate = await submit('提交重复当前', 3, pane); assert.deepEqual(duplicate.records, duplicateRows); assert.equal(duplicate.picked.selected, 1);
  assert.equal(duplicate.picked.selectedIdentity, null); assert.equal(typeof duplicate.picked.selectedTransient, 'string'); assert.ok(duplicate.picked.selectedTransient.length > 0);
  assert.equal(selectedRecord(duplicate).name, '同值'); assert.deepEqual(duplicate.picked.privateExtra, legacyPicked.privateExtra);
  await pane.getByText('当前：同值', { exact: true }).waitFor();
  assert.equal(await pane.getByRole('button', { name: '选择第 2 行', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await button('选择第 2 行').getAttribute('aria-pressed'), 'true', 'the same logical Table selection is visible in the inline sibling');
  await page.getByRole('button', { name: '关闭交互作品', exact: true }).click(); await surface.getByText('当前：同值', { exact: true }).waitFor();
  assert.equal(await button('选择第 2 行').getAttribute('aria-pressed'), 'true', 'closing a physical view does not retire the still-authored Table projection');
  await button('展开交互内容').click(); await pane.getByText('当前：同值', { exact: true }).waitFor();
  assert.equal(await pane.getByRole('button', { name: '选择第 2 行', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(submissions.length, 3); assert.equal(f.modelTurns, 4);
  const changed = await submit('重排并提交', 4, pane); assert.deepEqual(changed.records, reorderedRows); assertCleared(changed); assert.equal(selectedRecord(changed), null);
  await surface.getByText('当前：无', { exact: true }).waitFor();
  const changedFrames = await page.evaluate(() => window.tableTransactionFrames.slice(2)); frames.push(...changedFrames);
  assert.equal(changedFrames.length, 2); for (const frame of changedFrames) { assert.match(frame.text, /当前：无/); assert.deepEqual(frame.selected, []); }
  await surface.getByRole('status').filter({ hasText: /^已保存$/ }).waitFor();
  await pane.getByRole('button', { name: '选择第 2 行', exact: true }).click();
  await pane.getByRole('tab', { name: '说明', exact: true }).click(); await pane.getByText('当前：甲', { exact: true }).waitFor();
  const hidden = await submit('提交当前', 5, pane); assert.equal(selectedRecord(hidden).id, 'a'); assert.equal(hidden.picked.selected, 1);
  const retired = await submit('退出表格并提交', 6, pane); assertCleared(retired); assert.equal(selectedRecord(retired), null);
  await pane.getByText('当前：无', { exact: true }).waitFor();
  await pane.getByRole('button', { name: '显示表格', exact: true }).click(); await pane.getByRole('tab', { name: '记录', exact: true }).click();
  await pane.getByRole('status').filter({ hasText: /^已保存$/ }).waitFor();
  const saved = await until(async () => { const value = await f.api(stateURL); return value.status === 200 && value.body.state.records?.[0]?.id === 'c' && value.body.state.picked?.selected === null && value.body; });
  assertCleared(saved.state); assert.deepEqual(saved.state.unrelated, unrelated); assert.equal(f.modelTurns, 7);
  await pane.getByText('当前：无', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭交互作品', exact: true }).click(); await button('展开交互内容').click(); await pane.getByText('当前：无', { exact: true }).waitFor();
  assert.equal(await pane.locator('tr.is-selected').count(), 0); await page.getByRole('button', { name: '关闭交互作品', exact: true }).click();
  await page.reload(); await surface.getByText('当前：无', { exact: true }).waitFor();
  assert.deepEqual((await f.api(stateURL)).body.state, saved.state); assert.equal(submissions.length, 6); assert.equal(f.modelTurns, 7);
  await f.stop(); const durable = await f.persistedSession(sessionId), allUserRows = durable.rows.filter(row => row.type === 'user/message');
  // Host runtime-context, skill and time snapshots can also use user/message;
  // prompt admissions carry the native source.kind=user + request identity.
  const user = allUserRows.filter(row => row.data.source?.kind === 'user' && typeof row.data.source.rpcId === 'string');
  assert.equal(user.length, 7, 'the original seed and six explicit submissions are the seven durable native prompt requests');
  assert.equal(user.filter(event => event.data.source?.rpcId === seedRequestId).length, 1);
  for (const item of submissions) {
    assert.equal(item.sessionId, sessionId); assert.equal(item.mode, 'queue'); const messages = user.filter(event => event.data.source?.rpcId === item.requestId);
    assert.equal(messages.length, 1); assert.equal(textOf(messages[0].data.content), item.text);
  }
  const firstDurable = parsePayload(textOf(user.find(event => event.data.source?.rpcId === accepted[0]).data.content)); assertCleared(firstDurable);
  await page.goto(await f.boot()); await sessionRow().click(); await surface.getByText('当前：无', { exact: true }).waitFor();
  assert.deepEqual((await f.api(stateURL)).body.state, saved.state); assert.equal(await surface.locator('tr.is-selected').count(), 0);
  assert.equal(f.modelTurns, 7); assert.equal(submissions.length, 6); assert.deepEqual(f.errors, []);
  for (const file of files) assert.equal(digest(await readFile(file)), sourceSHA256[file], 'the verified production source/bundle changed: ' + file);
  if (directory) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await page.screenshot({ path: join(directory, 'table-selection-transaction.png'), fullPage: true });
    await writeFile(join(directory, 'table-selection-transaction.result.json'), JSON.stringify({ ranAt: new Date().toISOString(), mode: 'controlled synthetic model replay', realModelCalled: false,
      actualHostVersion: JSON.parse(await readFile(resolve('node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version, cftExecutable: f.cft, browserVersion: f.browser.version(),
      sourceSHA256, packageSHA256: digest(await readFile(f.tar)), sessionId, block, seededLegacyState: seeded.body.state, submissions, frames, stages,
      savedState: saved.state, durablePromptRequestCount: user.length, nativeInjectedUserMessageCount: allUserRows.length - user.length, acceptedRequestIds: accepted, nativeAtomicPayloadCleared: true, explicitReselectionRecord: '甲',
      duplicateExpandedTransientSubmitted: true, changedRowsCleared: true, hiddenTabPreservesProjection: true, retiredProjectionCleared: true, unrelatedLegacyRetained: true, reopenPassed: true, reloadPassed: true, restartPassed: true,
      noExtraNativePrompts: true, pageErrors: f.errors }, null, 2) + '\n', { mode: 0o600 });
  }
  passed = true;
});
