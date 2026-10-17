import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { currentSessionId } from './session.mjs';
import { acquireDocument } from '../document-store.mjs';

const TAB_ID = 'dsh-intelligent-ui/artifact';
const TAB_KIND = 'intelligent-ui-artifact';
const pointerKey = sessionId => `dsh.intelligent-ui.artifact.${sessionId}`;
const readPointer = sessionId => {
  try { const id = localStorage.getItem(pointerKey(sessionId)); return /^\d+:\d+:\d+:\d+$/.test(id ?? '') ? id : undefined; }
  catch { return undefined; }
};

export function installArtifactPane(ctx, { Surface, bridge }) {
  const records = new Map(), pendingReads = new Map(), selections = new Map();
  const listeners = new Set();
  const origins = new Map();
  let focusIntent;
  let focusSession=ctx.sidebarRight.mounted?.getSnapshot(),focusEpoch=0;
  const removeFocusWatcher=ctx.sidebarRight.mounted?.subscribe(()=>{
    const session=ctx.sidebarRight.mounted.getSnapshot();
    if(session!==focusSession){focusSession=session;focusEpoch++;focusIntent=undefined;origins.clear();}
  });
  let active = true;
  const get = (sessionId, blockId) => { const record = records.get(sessionId); return record?.blockId === blockId ? record : undefined; };
  const store = record => { records.set(record.sessionId, record); for (const listener of listeners) listener(); };
  const select = (sessionId, blockId) => {
    if(selections.has(sessionId)&&selections.get(sessionId)===blockId)return;
    selections.set(sessionId,blockId);pendingReads.get(sessionId)?.abort();pendingReads.delete(sessionId);
  };
  function Pane({ sessionId, useTabInfo }) {
    const info = useTabInfo();
    const pane = useRef(null);
    const blockId = info.tab.navigation.params?.blockId ?? readPointer(sessionId);
    const [version, redraw] = useState(0);
    const [error, setError] = useState(null), [attempt, retry] = useState(0);
    useEffect(() => { const listener = () => redraw(value => value + 1); listeners.add(listener); return () => listeners.delete(listener); }, []);
    void version;
    const item = get(sessionId, blockId);
    useLayoutEffect(() => { select(sessionId,blockId); },[sessionId,blockId,info.tab.navigation.revision]);
    useLayoutEffect(() => {
      const intent=focusIntent,element=pane.current;
      if(!element||!item||!intent||intent.epoch!==focusEpoch||intent.sessionId!==sessionId||intent.blockId!==blockId||!info.tab.visible||info.tab.signal.aborted||ctx.sidebarRight.mounted.getSnapshot()!==sessionId)return;
      focusIntent=undefined;
      const focused=document.activeElement;
      if(focused!==intent.origin&&focused!==document.body&&!element.contains(focused))return;
      if(intent.origin?.isConnected&&typeof intent.origin.focus==='function')origins.set(sessionId,{blockId,element:intent.origin});
      element.focus({preventScroll:true});
    },[sessionId,blockId,item,version,info.tab.visible,info.tab.navigation.revision,info.tab.signal]);
    useEffect(()=>{
      const clear=()=>{if(focusIntent?.sessionId===sessionId)focusIntent=undefined;origins.delete(sessionId);};
      info.tab.signal.addEventListener('abort',clear,{once:true});
      return()=>info.tab.signal.removeEventListener('abort',clear);
    },[sessionId,info.tab.signal]);
    useEffect(() => {
      setError(null);
      if (item || !blockId) return;
      const request = new AbortController();
      pendingReads.get(sessionId)?.abort();pendingReads.set(sessionId,request);
      const signal = AbortSignal.any([request.signal, info.tab.signal]);
      void fetch(`intelligent-ui/api/state?session=${encodeURIComponent(sessionId)}&block=${encodeURIComponent(blockId)}`, { signal })
        .then(async response => { if (!response.ok) throw new Error('作品源文读取失败'); return response.json(); })
        .then(record => {
          if (signal.aborted || !active || selections.get(sessionId)!==blockId || get(sessionId, blockId)) return;
          if (typeof record.source !== 'string') throw new Error('作品源文暂不可用');
          if ((record.session !== undefined && record.session !== sessionId) || (record.block !== undefined && record.block !== blockId)) throw new Error('作品身份不匹配');
          const document = acquireDocument(sessionId, blockId);
          try {
            // GET projections without a saved record omit identity fields;
            // bind those to this authenticated request before one-shot hydrate.
            document.store.update(record.source, false, { initialRecord: { ...record, session: sessionId, block: blockId } });
            store({ sessionId, blockId, source: record.source, streaming: false });
          } finally { document.release(); }
        }).catch(reason => { if (!signal.aborted) setError(reason.message); })
        .finally(() => { if (pendingReads.get(sessionId) === request) pendingReads.delete(sessionId); });
      return () => { request.abort();if (pendingReads.get(sessionId) === request) pendingReads.delete(sessionId); };
    }, [sessionId, blockId, item, info.tab.signal, attempt]);
    if (!item) return <div className="iui-artifact-placeholder" role={error ? 'alert' : 'status'}>
      {error ?? (blockId ? '正在恢复交互作品…' : '请从对话中的交互回答展开作品。')}
      {error && <button type="button" onClick={() => retry(value => value + 1)}>重试</button>}
    </div>;
    const close=()=>{
      const focused=document.activeElement,ownsFocus=pane.current?.contains(focused),origin=origins.get(sessionId);
      info.tab.actions.close();
      const current=document.activeElement;
      if(ownsFocus&&origin?.blockId===blockId&&origin.element.isConnected&&ctx.sidebarRight.mounted.getSnapshot()===sessionId&&(current===focused||current===document.body))origin.element.focus({preventScroll:true});
      origins.delete(sessionId);
    };
    return <div className="iui-artifact-pane" ref={pane} tabIndex={-1} aria-label="交互作品"><div className="iui-artifact-header"><span>交互作品</span><button type="button" aria-label="关闭交互作品" onClick={close}>关闭</button></div><Surface key={`${sessionId}/${blockId}`} {...item}
      expanded onSubmit={text => bridge.submit(sessionId, blockId, text, { signal: info.tab.signal })}
      onRepair={(input, options) => bridge.repair(sessionId, blockId, input, { signal: AbortSignal.any([info.tab.signal, options.signal]) })} /></div>;
  }
  const removeType = ctx.sidebarRightTabs.register({ id: TAB_ID, kind: TAB_KIND, priority: 'extension',
    title: () => '交互作品' });
  const removeBody = ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: TAB_ID,
  }, Pane));
  return {
    update(item) { if (active && (selections.has(item.sessionId) ? selections.get(item.sessionId) === item.blockId : get(item.sessionId,item.blockId) || readPointer(item.sessionId) === item.blockId)) store(item); },
    expand(item) {
      if (!active || currentSessionId(ctx) !== item.sessionId) throw new Error('请先打开作品所属会话');
      focusIntent={sessionId:item.sessionId,blockId:item.blockId,origin:document.activeElement,epoch:focusEpoch};
      select(item.sessionId,item.blockId);
      store(item);
      try { localStorage.setItem(pointerKey(item.sessionId), item.blockId); } catch {}
      ctx.sidebarRight.openTab(TAB_KIND, { params: { blockId: item.blockId } });
    },
    dispose() { active = false; focusIntent=undefined; origins.clear(); for(const request of pendingReads.values())request.abort();pendingReads.clear(); removeFocusWatcher?.(); removeBody(); removeType(); records.clear(); selections.clear(); listeners.clear(); },
  };
}
