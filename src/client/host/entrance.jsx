import React, { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

export const entranceStyles = `
.iui-new-session-seat{display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:1;-webkit-app-region:no-drag}
.iui-new-session-seat[hidden]{display:none}
button[data-iui-entrance-wide] > [class*="_newSessionShortcut"]{visibility:hidden}
.iui-new-session-chat{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-state-business-primary,#1677ff);cursor:pointer;padding:0}
.iui-new-session-chat svg{display:block;width:20px;height:20px;flex:none;pointer-events:none}
.iui-new-session-chat:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(22,119,255,.10))}
.iui-new-session-chat:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#1677ff);outline-offset:2px}
.iui-new-session-chat:disabled{opacity:.5;cursor:progress}
.iui-new-session-seat[data-iui-entrance-layout="overlay"]{z-index:20;opacity:0;pointer-events:none;transition:opacity .12s}
.iui-new-session-seat[data-iui-entrance-layout="overlay"][data-iui-entrance-hovered],
.iui-new-session-seat[data-iui-entrance-layout="overlay"][data-iui-entrance-keyboard],
.iui-new-session-seat[data-iui-entrance-layout="overlay"]:is(:hover,:focus-within){opacity:1;pointer-events:auto}
.iui-new-session-notice{position:fixed;z-index:10000;left:12px;bottom:16px;max-width:min(360px,calc(100vw - 24px));padding:10px 12px;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:12px;color:var(--dsw-alias-label-primary,#161616);background:var(--dsw-specific-sidebar-fill,#fff);box-shadow:0 8px 24px #0002;font-size:13px}
@media(pointer:coarse),(any-pointer:coarse){.iui-new-session-chat{width:44px;height:44px}.iui-new-session-seat[data-iui-entrance-layout="overlay"]{opacity:1;pointer-events:auto}}
@media(prefers-reduced-motion:reduce){.iui-new-session-seat[data-iui-entrance-layout="overlay"]{transition:none}}
`;

/** Only our seats are portalled. The native New Session DOM node and handlers stay owned by DSH. */
export function installEntranceSeats(document, notify, { MutationObserver = globalThis.MutationObserver,
  ResizeObserver = globalThis.ResizeObserver } = {}) {
  const seats = new Map();
  let scheduled = false, stopped = false;
  const selector = 'button[class*="_newSession"],button[class*="_iconButton"][aria-label]';
  const isNew = button => /_newSession(?:\s|$)/.test(button.className)
    || /^(?:新会话|新建会话|开始新会话|New Session|New session)$/i.test(button.getAttribute('aria-label') ?? '');
  const watch = (button, seat) => {
    const enter = () => seat.setAttribute('data-iui-entrance-hovered', '');
    const leave = event => {
      if (event.relatedTarget && (button.contains(event.relatedTarget) || seat.contains(event.relatedTarget))) return;
      seat.removeAttribute('data-iui-entrance-hovered');
    };
    const focus = () => seat.toggleAttribute('data-iui-entrance-keyboard', button.matches(':focus-visible'));
    const blur = () => seat.removeAttribute('data-iui-entrance-keyboard');
    for (const element of [button, seat]) {
      element.addEventListener('pointerenter', enter);
      element.addEventListener('pointerleave', leave);
    }
    button.addEventListener('focus', focus);
    button.addEventListener('blur', blur);
    button.addEventListener('keydown', focus);
    button.addEventListener('pointerdown', blur);
    return () => {
      for (const element of [button, seat]) {
        element.removeEventListener('pointerenter', enter);
        element.removeEventListener('pointerleave', leave);
      }
      button.removeEventListener('focus', focus);
      button.removeEventListener('blur', blur);
      button.removeEventListener('keydown', focus);
      button.removeEventListener('pointerdown', blur);
    };
  };
  const place = () => {
    if (stopped) return;
    for (const [button, record] of seats) {
      const root = button.parentElement;
      if (!button.isConnected || record.seat.parentElement !== root) continue;
      const rect = button.getBoundingClientRect();
      const nativeRow = /_newSession(?:\s|$)/.test(button.className);
      // A collapsed row/icon remains a separate native target. Do not overlay
      // two touch targets into a rail-sized button even inside a wider parent.
      const wide = nativeRow && rect.width >= 120 && root.getBoundingClientRect().width > 100;
      button.toggleAttribute('data-iui-entrance-wide', wide);
      record.seat.toggleAttribute('data-iui-entrance-overlay', wide);
      record.seat.dataset.iuiEntranceLayout = wide ? 'overlay' : nativeRow ? 'rail' : 'chrome';
      if (wide) {
        const fallback = document.defaultView?.matchMedia?.('(pointer:coarse),(any-pointer:coarse)').matches ? 44 : 32;
        // Measure the entry outside its parent's flex stretch, including when
        // the sidebar has just expanded from the static rail fallback.
        record.seat.style.position = 'fixed';
        const target = record.seat.getBoundingClientRect();
        // Only our sibling is positioned inside the native row's right edge;
        // DSH retains the full button box, DOM ownership and keyboard order.
        Object.assign(record.seat.style, { position: 'fixed', left: `${rect.right - 7 - (target.width || fallback)}px`,
          top: `${rect.top + (rect.height - (target.height || fallback)) / 2}px`, margin: '0' });
      } else if (nativeRow) {
        Object.assign(record.seat.style, { position: 'static', left: '', top: '', margin: '-6px 0 10px 4px' });
      } else {
        Object.assign(record.seat.style, { position: 'static', left: '', top: '', margin: '0 0 0 -4px' });
      }
      record.seat.hidden = rect.width === 0 || rect.height === 0;
      record.seat.toggleAttribute('data-iui-entrance-hovered', button.matches(':hover') || record.seat.matches(':hover'));
      record.seat.toggleAttribute('data-iui-entrance-keyboard', button.matches(':focus-visible'));
    }
  };
  const scan = () => {
    scheduled = false;
    if (stopped) return;
    let changed = false;
    for (const [button, record] of seats) {
      if (button.isConnected && record.seat.parentElement === button.parentElement) continue;
      record.release(); resize?.unobserve(button); resize?.unobserve(record.seat); button.removeAttribute('data-iui-entrance-wide'); record.seat.remove();
      seats.delete(button); changed = true;
    }
    for (const button of document.querySelectorAll(selector)) {
      if (!isNew(button) || seats.has(button)) continue;
      const seat = document.createElement('span');
      seat.className = 'iui-new-session-seat'; seat.dataset.iuiEntrance = '';
      button.after(seat); seats.set(button, { seat, release: watch(button, seat) }); resize?.observe(button); resize?.observe(seat); changed = true;
    }
    place();
    if (changed) notify([...seats.values()].map(record => record.seat));
  };
  const schedule = () => { if (!scheduled && !stopped) { scheduled = true; queueMicrotask(scan); } };
  const observer = new MutationObserver(records => {
    for (const [button, record] of seats) {
      if (!button.isConnected || record.seat.parentElement !== button.parentElement) { schedule(); return; }
    }
    for (const mutation of records) {
      const target = mutation.target;
      // Only relevant mutations need to rediscover native entrance buttons.
      if ([...seats.keys()].some(button => target === button || target.contains?.(button))) { schedule(); return; }
      if (mutation.type === 'attributes') {
        if (target.matches?.(selector) && isNew(target)) { schedule(); return; }
      } else for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(selector) && isNew(node) || [...node.querySelectorAll(selector)].some(isNew)) { schedule(); return; }
      }
    }
    // Unrelated content can still shift the row without resizing it.
    place();
  });
  const resize = ResizeObserver ? new ResizeObserver(place) : undefined;
  observer.observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'aria-label', 'aria-keyshortcuts', 'data-sidebar-collapsed'] });
  document.defaultView?.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true);
  scan();
  return () => {
    stopped = true; observer.disconnect(); resize?.disconnect();
    document.defaultView?.removeEventListener('resize', schedule); document.removeEventListener('scroll', schedule, true);
    for (const [button, record] of seats) { record.release(); button.removeAttribute('data-iui-entrance-wide'); record.seat.remove(); }
    seats.clear();
  };
}

export function IntelligentEntrance({ bridge }) {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [seats, setSeats] = useState([]);
  useLayoutEffect(() => installEntranceSeats(document, setSeats), []);
  return <>
    {seats.map((seat, index) => createPortal(<button type="button" className="iui-new-session-chat iui-new-session-plus"
      aria-label="新建智能聊天" title="Chat · 新建智能聊天" disabled={state.busy}
      onClick={() => { void bridge.create().catch(() => {}); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M6 4h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9l-5 3V7a3 3 0 0 1 2-3Z"/><path d="M8 9h8M8 13h5"/></svg></button>, seat, `entrance:${index}`))}
    {state.error && <div className="iui-new-session-notice" role="alert">{state.error}</div>}
  </>;
}
