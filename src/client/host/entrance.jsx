import React, { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

export const entranceStyles = `
.iui-new-session-seat{display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:1;-webkit-app-region:no-drag}
.iui-new-session-seat[hidden]{display:none}
.iui-new-session-plus{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:9px;background:var(--dsw-alias-button-elevated-fill,#fff);color:var(--dsw-alias-state-business-primary,#1677ff);font:500 20px/1 system-ui;cursor:pointer;padding:0}
.iui-new-session-plus:hover{background:var(--dsw-alias-interactive-bg-hover,#eef3ff)}
.iui-new-session-plus:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#1677ff);outline-offset:2px}
.iui-new-session-plus:disabled{opacity:.5;cursor:progress}
.iui-new-session-notice{position:fixed;z-index:10000;left:12px;bottom:16px;max-width:min(360px,calc(100vw - 24px));padding:10px 12px;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:12px;color:var(--dsw-alias-label-primary,#161616);background:var(--dsw-specific-sidebar-fill,#fff);box-shadow:0 8px 24px #0002;font-size:13px}
button[data-iui-entrance-wide]{margin-right:42px!important}
@media(pointer:coarse){.iui-new-session-plus{width:44px;height:44px}button[data-iui-entrance-wide]{margin-right:54px!important}}
`;

/** Only our seats are portalled. The native New Session DOM node and handlers stay owned by DSH. */
export function installEntranceSeats(document, notify, { MutationObserver = globalThis.MutationObserver,
  ResizeObserver = globalThis.ResizeObserver } = {}) {
  const seats = new Map();
  let scheduled = false, stopped = false;
  const selector = 'button[class*="_newSession"],button[class*="_iconButton"][aria-label]';
  const isNew = button => /_newSession(?:\s|$)/.test(button.className)
    || /^(?:新会话|新建会话|开始新会话|New Session|New session)$/i.test(button.getAttribute('aria-label') ?? '');
  const place = () => {
    if (stopped) return;
    for (const [button, record] of seats) {
      const root = button.parentElement;
      if (!button.isConnected || record.seat.parentElement !== root) continue;
      const rect = button.getBoundingClientRect();
      const wide = /_newSession(?:\s|$)/.test(button.className) && root.getBoundingClientRect().width > 100;
      button.toggleAttribute('data-iui-entrance-wide', wide);
      if (wide) {
        const after = button.getBoundingClientRect();
        Object.assign(record.seat.style, { position: 'absolute', left: `${after.right + 5}px`,
          top: `${after.top + (after.height - (record.seat.getBoundingClientRect().height || 32)) / 2}px`, margin: '0' });
        // Fixed coordinates follow native sidebar geometry; the sibling preserves keyboard order.
        record.seat.style.position = 'fixed';
      } else if (/_newSession(?:\s|$)/.test(button.className)) {
        Object.assign(record.seat.style, { position: 'static', left: '', top: '', margin: '-6px 0 10px 4px' });
      } else {
        Object.assign(record.seat.style, { position: 'static', left: '', top: '', margin: '0 0 0 -4px' });
      }
      record.seat.hidden = rect.width === 0 || rect.height === 0;
    }
  };
  const scan = () => {
    scheduled = false;
    if (stopped) return;
    let changed = false;
    for (const [button, record] of seats) {
      if (button.isConnected && record.seat.parentElement === button.parentElement) continue;
      resize?.unobserve(button); button.removeAttribute('data-iui-entrance-wide'); record.seat.remove();
      seats.delete(button); changed = true;
    }
    for (const button of document.querySelectorAll(selector)) {
      if (!isNew(button) || seats.has(button)) continue;
      const seat = document.createElement('span');
      seat.className = 'iui-new-session-seat'; seat.dataset.iuiEntrance = '';
      button.after(seat); seats.set(button, { seat }); resize?.observe(button); changed = true;
    }
    place();
    if (changed) notify([...seats.values()].map(record => record.seat));
  };
  const schedule = () => { if (!scheduled && !stopped) { scheduled = true; queueMicrotask(scan); } };
  const observer = new MutationObserver(schedule);
  const resize = ResizeObserver ? new ResizeObserver(place) : undefined;
  observer.observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'aria-label', 'aria-keyshortcuts', 'data-sidebar-collapsed'] });
  document.defaultView?.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true);
  scan();
  return () => {
    stopped = true; observer.disconnect(); resize?.disconnect();
    document.defaultView?.removeEventListener('resize', schedule); document.removeEventListener('scroll', schedule, true);
    for (const [button, record] of seats) { button.removeAttribute('data-iui-entrance-wide'); record.seat.remove(); }
    seats.clear();
  };
}

export function IntelligentEntrance({ bridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [seats, setSeats] = useState([]);
  useLayoutEffect(() => installEntranceSeats(document, setSeats), []);
  return <>
    {seats.map((seat, index) => createPortal(<button type="button" className="iui-new-session-plus"
      aria-label="新建智能聊天" title="新建智能聊天" disabled={state.busy}
      onClick={() => { void bridge.create().catch(() => {}); }}><span aria-hidden="true">+</span></button>, seat, `entrance:${index}`))}
    {state.error && <div className="iui-new-session-notice" role="alert">{state.error}</div>}
  </>;
}
