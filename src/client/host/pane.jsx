import React, { useEffect, useState } from 'react';
import { currentSessionId } from './session.mjs';

const TAB_ID = 'dsh-intelligent-ui/artifact';
const TAB_KIND = 'intelligent-ui-artifact';
const pointerKey = sessionId => `dsh.intelligent-ui.artifact.${sessionId}`;
const readPointer = sessionId => {
  try { const id = localStorage.getItem(pointerKey(sessionId)); return /^\d+:\d+:\d+:\d+$/.test(id ?? '') ? id : undefined; }
  catch { return undefined; }
};

export function installArtifactPane(ctx, { Surface, bridge }) {
  const records = new Map();
  const listeners = new Set();
  let active = true;
  const get = (sessionId, blockId) => records.get(`${sessionId}/${blockId}`);
  const store = record => { records.set(`${record.sessionId}/${record.blockId}`, record); for (const listener of listeners) listener(); };
  function Pane({ sessionId, useTabInfo }) {
    const info = useTabInfo();
    const blockId = info.tab.navigation.params?.blockId ?? readPointer(sessionId);
    const [version, redraw] = useState(0);
    const [error, setError] = useState(null), [attempt, retry] = useState(0);
    useEffect(() => { const listener = () => redraw(value => value + 1); listeners.add(listener); return () => listeners.delete(listener); }, []);
    void version;
    const item = get(sessionId, blockId);
    useEffect(() => {
      setError(null);
      if (item || !blockId) return;
      const request = new AbortController();
      const signal = AbortSignal.any([request.signal, info.tab.signal]);
      void fetch(`intelligent-ui/api/state?session=${encodeURIComponent(sessionId)}&block=${encodeURIComponent(blockId)}`, { signal })
        .then(async response => { if (!response.ok) throw new Error('作品源文读取失败'); return response.json(); })
        .then(record => {
          if (signal.aborted || !active || get(sessionId, blockId)) return;
          if (typeof record.source !== 'string') throw new Error('作品源文暂不可用');
          store({ sessionId, blockId, source: record.source, streaming: false });
        }).catch(reason => { if (!signal.aborted) setError(reason.message); });
      return () => request.abort();
    }, [sessionId, blockId, item, info.tab.signal, attempt]);
    if (!item) return <div className="iui-artifact-placeholder" role={error ? 'alert' : 'status'}>
      {error ?? (blockId ? '正在恢复交互作品…' : '请从对话中的交互回答展开作品。')}
      {error && <button type="button" onClick={() => retry(value => value + 1)}>重试</button>}
    </div>;
    return <div className="iui-artifact-pane"><Surface key={`${sessionId}/${blockId}`} {...item}
      expanded onSubmit={text => bridge.submit(sessionId, blockId, text, { signal: info.tab.signal })} /></div>;
  }
  const removeType = ctx.sidebarRightTabs.register({ id: TAB_ID, kind: TAB_KIND, priority: 'extension',
    title: () => '交互作品' });
  const removeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: TAB_ID,
  }, Pane));
  return {
    update(item) { if (active && (get(item.sessionId, item.blockId) || readPointer(item.sessionId) === item.blockId)) store(item); },
    expand(item) {
      if (!active || currentSessionId(ctx) !== item.sessionId) throw new Error('请先打开作品所属会话');
      store(item);
      try { localStorage.setItem(pointerKey(item.sessionId), item.blockId); } catch {}
      ctx.sidebarRight.openTab(TAB_KIND, { params: { blockId: item.blockId } });
    },
    dispose() { active = false; removeBody(); removeType(); records.clear(); listeners.clear(); },
  };
}
