import { repairPayload, repairText, repairSavedState, verifyRepairSource } from './repair.mjs';

const PRESET = 'intelligent-chat';

export function currentSessionId(ctx) {
  return ctx.uiSession.adapter.current.getSnapshot().key;
}

function refusal(result, operation) {
  if (!result?.ok) throw new Error(`${operation}: ${result?.error?.message ?? '宿主未接受请求'}`);
  return result.value;
}

function selectionOf(ctx, id) {
  const projected = id && ctx.sessions.binding(id)?.session.projections?.faceOf('modelSelection').getSnapshot();
  const value = projected?.next ?? projected?.lastUsed;
  if (typeof value?.provider !== 'string' || typeof value?.model !== 'string') return undefined;
  return { provider: value.provider, model: value.model,
    ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}) };
}

export function creationOptions(ctx, origin) {
  const snapshot = ctx.workspaces.list.getSnapshot();
  const workspace = snapshot.items.find(item => item.sessionIds.includes(origin));
  if (workspace) return { workspaceId: workspace.workspaceId };
  // This is also the native New Session policy when no viewed Session owns a Workspace.
  const summaries = ctx.sessions.list.getSnapshot().byId;
  let recent, latest = Number.NEGATIVE_INFINITY;
  for (const item of snapshot.items) {
    const used = item.sessionIds.reduce((time, id) => Math.max(time, summaries[id]?.updatedAt ?? Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY);
    const time = Number.isFinite(used) ? used : Date.parse(item.createdAt ?? '') || 0;
    if (!recent || time > latest) { recent = item; latest = time; }
  }
  if (recent) return { workspaceId: recent.workspaceId };
  const current = origin && ctx.sessions.list.getSnapshot().byId[origin];
  if (current?.cwd) return { cwd: current.cwd };
  return {};
}

function waitForSnapshot(source, accepts, signal, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    let off = () => {}, timer;
    const finish = error => { off(); clearTimeout(timer); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(source.getSnapshot()); };
    const abort = () => finish(signal.reason ?? new Error('操作已取消'));
    const sync = () => { if (accepts(source.getSnapshot())) finish(); };
    off = source.subscribe(sync);
    timer = setTimeout(() => finish(new Error(message)), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else sync();
  });
}

/** Native composer requires Workspace membership; a bare cwd Session stays read-only. */
export async function resolveCreationOptions(ctx, origin, signal, timeoutMs = 10000) {
  if (ctx.workspaces.list.getSnapshot().phase === 'pending') {
    await waitForSnapshot(ctx.workspaces.list, value => value.phase === 'ready', signal, timeoutMs, '工作区列表尚未就绪');
  }
  signal.throwIfAborted();
  const selected = creationOptions(ctx, origin);
  if (selected.workspaceId) return selected;
  const workspace = selected.cwd
    ? await ctx.workspaces.create({ path: selected.cwd })
    : await ctx.workspaces.initializeDefault(signal);
  signal.throwIfAborted();
  const id = workspace?.workspaceId ?? creationOptions(ctx, origin).workspaceId;
  if (!id) throw new Error('请先选择工作区，宿主未能准备默认工作区');
  return { workspaceId: id };
}

export function waitForSelection(ctx, sessionId, signal, timeoutMs = 10000, origin) {
  const source = ctx.uiSession.adapter.current;
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {}, timer;
    const finish = (error) => {
      unsubscribe(); clearTimeout(timer); signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(signal.reason ?? new Error('操作已取消'));
    const sync = () => {
      const selected = source.getSnapshot().key;
      if (selected === sessionId) finish();
      else if (selected !== undefined && selected !== origin) finish(new Error('会话打开未完成，当前页面已切换'));
    };
    unsubscribe = source.subscribe(sync);
    timer = setTimeout(() => finish(new Error('等待会话打开超时')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else sync();
  });
}

function waitForPreset(binding, signal, timeoutMs) {
  const source = binding.session.projections.faceOf('agentPreset');
  return new Promise((resolve, reject) => {
    let off = () => {}, timer;
    const finish = error => { off(); clearTimeout(timer); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const abort = () => finish(signal.reason ?? new Error('操作已取消'));
    const sync = () => { if (source.getSnapshot() === PRESET) finish(); };
    off = source.subscribe(sync);
    timer = setTimeout(() => finish(new Error('智能聊天模式尚未生效，未打开会话')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else sync();
  });
}

/** Owns exact Session identities. A UI action can never borrow the current chat by accident. */
export function createSessionBridge(ctx, { timeoutMs = 10000 } = {}) {
  const lifetime = new AbortController();
  const listeners = new Set();
  const submissions = new Map();
  let snapshot = Object.freeze({ busy: false, error: null });
  let creating;
  const publish = next => { snapshot = Object.freeze(next); for (const listener of listeners) listener(); };
  const assertLive = () => lifetime.signal.throwIfAborted();
  const isVisible = id => currentSessionId(ctx) === id && (ctx.layout?.panelInfo?.getSnapshot().activePanelId ?? null) === null;

  async function start() {
    assertLive();
    const origin = currentSessionId(ctx);
    const originPanel = ctx.layout?.panelInfo?.getSnapshot().activePanelId;
    const model = selectionOf(ctx, origin);
    let id, reference, opening = false;
    const cancelled = new AbortController();
    const signal = AbortSignal.any([lifetime.signal, cancelled.signal]);
    const checkOrigin = () => {
      if (!opening && (currentSessionId(ctx) !== origin || ctx.layout?.panelInfo?.getSnapshot().activePanelId !== originPanel)) {
        cancelled.abort(new Error('页面已切换，智能会话创建已取消'));
      }
    };
    const offSelection = ctx.uiSession.adapter.current.subscribe(checkOrigin);
    const offPanel = ctx.layout?.panelInfo?.subscribe(checkOrigin) ?? (() => {});
    publish({ busy: true, error: null });
    try {
      const createOptions = await resolveCreationOptions(ctx, origin, signal, timeoutMs);
      signal.throwIfAborted();
      id = await ctx.sessions.create(createOptions);
      signal.throwIfAborted();
      reference = ctx.sessions.retain(id, { source: 'intelligentUI', signal });
      await reference.ready;
      signal.throwIfAborted();
      refusal(await ctx.remote.agentPresets.select(id, PRESET), '选择智能聊天模式失败');
      signal.throwIfAborted();
      if (model) {
        refusal(await ctx.remote.session.selectModel({ sessionId: id, ...model }), '继承模型选择失败');
        signal.throwIfAborted();
      }
      await ctx.sessions.refreshProjections(id);
      signal.throwIfAborted();
      await waitForPreset(reference.binding, signal, timeoutMs);
      checkOrigin(); signal.throwIfAborted();
      opening = true;
      ctx.uiWorkspace.openSession(id);
      await waitForSelection(ctx, id, signal, timeoutMs, origin);
      if (!isVisible(id)) throw new Error('智能会话未显示，未发送消息');
      return id;
    } catch (error) {
      // Only this attempt's unused, blank Session is eligible for recovery.
      if (id && !isVisible(id) && ctx.sessions.list.getSnapshot().byId[id]?.blank) {
        await ctx.workspaces.archiveSession?.(id).catch(() => {});
      }
      if (!lifetime.signal.aborted) publish({ busy: true, error: error.message ?? String(error) });
      throw error;
    } finally {
      offSelection(); offPanel(); reference?.release();
      if (!lifetime.signal.aborted) publish({ ...snapshot, busy: false });
    }
  }

  const bridge = {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    create() {
      if (creating) return creating;
      const attempt = start();
      creating = attempt.finally(() => { if (creating === managed) creating = undefined; });
      const managed = creating;
      return managed;
    },
    submit(sessionId, blockId, text, options = {}) {
      return submit(sessionId, blockId, text, options);
    },
    repair(sessionId, blockId, input, { signal } = {}) {
      let packet;
      try { packet = repairPayload(sessionId, blockId, input); }
      catch (error) { return Promise.reject(error); }
      const source = packet.sourceChunks.join('');
      return submit(sessionId, blockId, repairText(blockId), { signal, identityExtra: packet,
        prepare: async signal => {
          const verified = await verifyRepairSource(sessionId, blockId, source, signal);
          packet.sourceRevision = verified.sourceRevision;
          packet.componentsVersion = verified.componentsVersion;
          packet.persistedStateJsonChunks = repairSavedState(verified.state);
          const uploaded = refusal(await ctx.fileUpload.upload(sessionId,
            new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' }),
            `intelligent-ui-repair-${blockId.replaceAll(':', '-')}.json`, signal), '作品修复附件上传失败');
          signal.throwIfAborted();
          if (typeof uploaded?.receiptId !== 'string' || !uploaded.file) throw new Error('宿主未提供有效的作品附件');
          const current = await verifyRepairSource(sessionId, blockId, source, signal);
          if (current.componentsVersion !== packet.componentsVersion) throw new Error('作品版本已变化，请重新打开后重试');
          if (current.revision !== verified.revision || JSON.stringify(current.state) !== JSON.stringify(verified.state)) throw new Error('作品已保存设置发生变化，请重试修复');
          return { attachments: [{ type: 'file', value: uploaded.file }], content: [{ type: 'file', receiptId: uploaded.receiptId }] };
        } });
    },
    dispose() { lifetime.abort(new Error('智能界面插件已停用')); listeners.clear(); },
  };

  function submit(sessionId, blockId, text, { signal: callerSignal, prepare, identityExtra } = {}) {
      assertLive();
      if (typeof sessionId !== 'string' || !/^\d+:\d+:\d+:\d+$/.test(blockId)) return Promise.reject(new Error('交互回答身份无效'));
      if (typeof text !== 'string' || text.trim() === '' || text.length > 64000) return Promise.reject(new Error('提交内容为空或过长'));
      if (!isVisible(sessionId)) return Promise.reject(new Error('请先打开这条回答所在的会话再提交'));
      if (callerSignal?.aborted) return Promise.reject(callerSignal.reason ?? new Error('提交已取消'));
      const expectedBinding = ctx.sessions.binding(sessionId);
      // Only the same answer's identical live intent is a double click. Native
      // queue admission owns ordering and receipts for every distinct intent.
      const identity = JSON.stringify([sessionId, blockId, text, identityExtra]);
      const previous = submissions.get(identity);
      if (previous && !previous.signal.aborted && previous.binding === expectedBinding) return previous.promise;
      const cancelled = new AbortController();
      const signal = AbortSignal.any([lifetime.signal, cancelled.signal, ...(callerSignal ? [callerSignal] : [])]);
      const checkVisible = () => {
        if (!isVisible(sessionId)) cancelled.abort(new Error('会话已切换，提交已取消'));
      };
      const offSelection = ctx.uiSession.adapter.current.subscribe(checkVisible);
      const offPanel = ctx.layout?.panelInfo?.subscribe(checkVisible) ?? (() => {});
      const operation = ctx.sessions.using(sessionId, { source: 'intelligentUI', signal }, async reference => {
        await reference.ready;
        signal.throwIfAborted();
        if (!isVisible(sessionId) || (expectedBinding && reference.binding !== expectedBinding)
          || ctx.sessions.binding(sessionId) !== reference.binding) throw new Error('回答所属会话已变更');
        const session = reference.binding.session;
        if (session.getSnapshot().removed) throw new Error('会话已关闭');
        const prepared = prepare ? await prepare(signal) : { attachments: [], content: [] };
        signal.throwIfAborted();
        if (!isVisible(sessionId) || ctx.sessions.binding(sessionId) !== reference.binding || session.getSnapshot().removed) throw new Error('回答所属会话已变更');
        const submission = session.beginSubmission({ mode: 'queue', text, attachments: prepared.attachments });
        try {
          refusal(await session.prompt([{ type: 'text', text }, ...prepared.content], 'queue', signal, submission.requestId), '提交失败');
        } catch (error) { submission.abandon(); throw error; }
      });
      const managed = operation.finally(() => {
        offSelection(); offPanel();
        if (submissions.get(identity)?.promise === managed) submissions.delete(identity);
      });
      submissions.set(identity, { promise: managed, binding: expectedBinding, signal });
      return managed;
  }
  return bridge;
}
