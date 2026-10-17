import React, { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ScenePlayback } from '../scene-playback.mjs';
import { FigureViewport } from './FigureViewport.jsx';
import { fieldError, fieldValue, InputControl } from './controls.jsx';
import { disabled, display, ErrorMessage, evaluate, formatNumber, invoke, numeric, paint, useBound } from './shared.jsx';

function Result({ result, label, unit, precision = 2 }) {
  const value=typeof result.value==='number'&&Number.isFinite(result.value)?new Intl.NumberFormat('zh-CN',{minimumFractionDigits:precision,maximumFractionDigits:precision}).format(result.value):display(result.value);
  return <div className="iui-calculation-result"><span className="iui-muted">{label}</span>{result.error ? <ErrorMessage>{result.error}</ErrorMessage> : <output className="iui-result-value">{value}{unit && <span>{unit}</span>}</output>}</div>;
}
export function Calculator({ props: p, api }) {
  const locals = Object.fromEntries(p.fields.map(field => [field.name, fieldValue(field, api)]));
  const invalid = p.fields.map(field => fieldError(field, locals[field.name]) || ((!field.type || field.type === 'number' || field.type === 'slider') && !Number.isFinite(locals[field.name]) ? '请输入有效数字' : ''));
  const result = invalid.some(Boolean) ? { error: '请检查输入范围' } : evaluate(api, p.formula, locals);
  return <section className="iui-calculator" aria-label={p.title || '计算器'}>{p.title && <h3>{p.title}</h3>}<div className="iui-form-fields">{p.fields.map((field, index) => <InputControl key={field.name} props={{ ...field, bind: field.name }} kind={field.type || 'number'} api={api} error={invalid[index]} />)}</div><Result result={result} label={p.resultLabel || '计算结果'} unit={p.unit} precision={p.precision} /><div className="iui-result-grid">{p.results?.map((item, index) => <Result key={index} result={invalid.some(Boolean) ? { error: '请检查输入范围' } : evaluate(api, item.formula, locals)} {...item} />)}</div><span className="iui-hint">调整参数即可更新结果。</span></section>;
}

export function Diagram({ props: p, api }) {
  const [selected, set, error] = useBound(api, p.bind, null);
  const id = useId().replace(/:/g, '');
  const width = 600, height = 320;
  const nodes = p.nodes.map((node, index) => ({ ...node, x: node.x ?? 100 + index % 3 * 200, y: node.y ?? 70 + Math.floor(index / 3) * 110 }));
  const fullHeight = Math.max(height, ...nodes.map(node => node.y + 60));
  const chosen = nodes.find(node => node.id === selected);
  const inactive = disabled(api);
  return <figure className="iui-diagram">{p.title && <figcaption className="iui-chart-title">{p.title}</figcaption>}<FigureViewport width={width} height={fullHeight} label={p.title || '交互示意图'}><svg viewBox={`0 0 ${width} ${fullHeight}`} role="group" aria-label={p.title || '交互示意图'}>
    <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--iui-muted)" /></marker></defs>
    {p.edges.map((edge, index) => {
      const from = nodes.find(node => node.id === edge.from), to = nodes.find(node => node.id === edge.to);
      if (!from || !to) return null;
      const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const dx = (to.x - from.x) / distance, dy = (to.y - from.y) / distance;
      return <g key={index}><line x1={from.x + dx * 65} y1={from.y + dy * 25} x2={to.x - dx * 70} y2={to.y - dy * 30} stroke="var(--iui-muted)" strokeWidth="1.5" markerEnd={`url(#${id}-arrow)`} />{edge.label && <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 10} textAnchor="middle" className="iui-chart-label">{edge.label}</text>}</g>;
    })}
    {nodes.map(node => <g key={node.id} role="button" tabIndex={inactive ? -1 : 0} aria-label={node.label} aria-pressed={selected === node.id} aria-disabled={inactive} className={`iui-diagram-node ${selected === node.id ? 'is-selected' : ''}`} onClick={() => set(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); set(node.id); } }}><rect x={node.x - 72} y={node.y - 28} width="144" height="56" rx="12" /><text x={node.x} y={node.y + 5} textAnchor="middle">{node.label.length > 12 ? `${node.label.slice(0, 12)}…` : node.label}</text></g>)}
  </svg></FigureViewport><div className="iui-diagram-detail" aria-live="polite">{chosen ? <><strong>{chosen.label}</strong><p>{chosen.detail || '暂无补充说明'}</p></> : <span className="iui-muted">选择节点查看说明。</span>}</div>{error && <ErrorMessage>{error}</ErrorMessage>}</figure>;
}

function SceneMark({ mark, onClick, onPointerDown, draggable, inactive, keyboardEvents }) {
  const properties = { fill: mark.fill === undefined ? paint('blue') : paint(mark.fill), stroke: mark.stroke === undefined ? 'none' : paint(mark.stroke, 'gray'), strokeWidth: Math.max(0, Math.min(20, numeric(mark.strokeWidth, 1.5))), opacity: Math.max(0, Math.min(1, numeric(mark.opacity, 1))) };
  const coordinate = value => Math.max(-10000, Math.min(10000, numeric(value)));
  let element;
  if (mark.type === 'circle') element = <circle {...properties} cx={coordinate(mark.x)} cy={coordinate(mark.y)} r={Math.max(0, Math.min(2000, numeric(mark.r, 8)))} />;
  if (mark.type === 'rect') element = <rect {...properties} x={coordinate(mark.x)} y={coordinate(mark.y)} width={Math.max(0, Math.min(4000, numeric(mark.width, 40)))} height={Math.max(0, Math.min(4000, numeric(mark.height, 40)))} rx="4" />;
  if (mark.type === 'line') element = <line {...properties} x1={coordinate(mark.x)} y1={coordinate(mark.y)} x2={coordinate(mark.x2)} y2={coordinate(mark.y2)} stroke={mark.stroke ? paint(mark.stroke, 'gray') : paint('gray')} />;
  if (mark.type === 'text') element = <text {...properties} x={coordinate(mark.x)} y={coordinate(mark.y)} fontSize={Math.min(96, Math.max(8, numeric(mark.fontSize, 16)))}>{display(mark.text)}</text>;
  if (mark.type === 'path') element = <polyline {...properties} fill={mark.fill ? paint(mark.fill) : 'none'} stroke={mark.stroke ? paint(mark.stroke) : paint('blue')} points={Array.isArray(mark.points) ? mark.points.slice(0, 1000).filter(point => Array.isArray(point) && point.length === 2).map(point => `${coordinate(point[0])},${coordinate(point[1])}`).join(' ') : ''} />;
  // Draw-only labels and overlays must not steal an underlying target's press.
  return <g data-iui-mark-id={mark.id} pointerEvents={mark.interactive ? undefined : 'none'} className={mark.interactive ? `iui-scene-target${draggable ? ' iui-scene-draggable' : ''}` : undefined} role={mark.interactive ? 'button' : undefined} tabIndex={mark.interactive && !inactive ? 0 : undefined} aria-label={mark.label || (mark.interactive ? mark.id : undefined)} aria-disabled={mark.interactive ? inactive : undefined} onPointerDown={mark.interactive && draggable ? event => onPointerDown(mark.id, event) : undefined} onClick={mark.interactive ? event => { event.stopPropagation(); onClick(mark.id, event); } : undefined} onKeyDown={mark.interactive && !keyboardEvents ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onClick(mark.id, undefined, { x: numeric(mark.x) + (mark.type === 'rect' ? numeric(mark.width) / 2 : 0), y: numeric(mark.y) + (mark.type === 'rect' ? numeric(mark.height) / 2 : 0) }); } } : undefined}>{element}{mark.label && <title>{mark.label}</title>}</g>;
}

const derivedScenes = new WeakMap();
function deriveSceneView(api, scene, bind) {
  try {
    const owner=api?.playback,state=api?.state;
    if(!owner||typeof owner!=='object'||!state||typeof state!=='object'||!scene||typeof scene!=='object')return api?.sceneView?.(scene,bind);
    // Document state and the evaluated tree are immutable snapshots shared by
    // inline and expanded surfaces. Charge each successful derivation once,
    // while retiring cached snapshots with their document/source generation.
    let cached=derivedScenes.get(owner);
    if(!cached||cached.version!==api.playbackVersion){cached={version:api.playbackVersion,states:new WeakMap()};derivedScenes.set(owner,cached);}
    let scenes=cached.states.get(state);
    if(!scenes){scenes=new WeakMap();cached.states.set(state,scenes);}
    let views=scenes.get(scene);
    if(!views){views=new Map();scenes.set(scene,views);}
    if(views.has(bind))return views.get(bind);
    const view=api?.sceneView?.(scene,bind);
    // A budget failure must be retried through the original guarded API.
    if(view&&!view.error)views.set(bind,view);
    return view;
  } catch (error) { return {error:error?.message||'场景无法显示'}; }
}

export function Scene({ props: p, api, controls = true, restartFields = [], showTitle = true, view: suppliedView }) {
  const container = useRef(null);
  const latest = useRef({ api, p });
  const localPlayback=useMemo(()=>new ScenePlayback(),[]);
  const player=useMemo(()=>(api?.playback??localPlayback).get(p.bind),[api?.playback,api?.playbackVersion,localPlayback,p.bind]);
  const playing=useSyncExternalStore(player.subscribe,player.snapshot,()=>false);
  const lease=useRef(null);
  const gestureOwner=useRef(Symbol('scene-gesture'));
  const dragging=useRef(null);
  const mounted=useRef(true);
  const suppressClick=useRef(new Set());
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [actionError, setActionError] = useState('');
  const inactive = disabled(api);
  const titleId = useId();
  const view = suppliedView ?? deriveSceneView(api,p.scene,p.bind);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const change = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { const seen=entries.some(entry => entry.isIntersecting);if(!seen)dragging.current?.cancel();setVisible(seen); }, { threshold: 0.01 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const unavailable = !view || Boolean(view.error);
  const timed = Boolean(p.scene.events?.tick);
  const draggable = Boolean(p.scene.events?.drag);
  const hasShortcuts=Boolean(view?.actions?.some(action=>action.shortcut));
  const hasHelp=Boolean(draggable||p.scene.events?.key||p.scene.events?.click||timed||restartFields.length>0||hasShortcuts);
  useEffect(() => { mounted.current=true;return () => { mounted.current=false; }; }, []);
  // Evaluation recreates scene objects after local state changes; compare the
  // definition and source version rather than cancelling on object identity.
  const sceneSignature = useMemo(() => JSON.stringify(p.scene), [p.scene]);
  latest.current = { api, p, player, sceneSignature, sourceVersion: api?.playbackVersion, active:visible&&foreground&&!inactive&&!unavailable };
  useEffect(() => () => { dragging.current?.cancel(); }, [player, p.bind, sceneSignature, api?.playbackVersion]);
  useEffect(() => {
    const gesture=dragging.current;
    if (gesture && (!visible || !foreground || inactive || unavailable || !view?.marks.some(mark => mark.id === gesture.id && mark.interactive))) gesture.cancel();
  }, [visible, foreground, inactive, unavailable, view]);
  useEffect(() => {
    const tick=dt=>{const current=latest.current;invoke(current.api,{type:'scene',name:current.p.bind,scene:current.p.scene,event:'tick',payload:{dt}},message=>{setActionError(message);player.pause();});};
    lease.current=player.attach({active:false,tick,error:error=>setActionError(error?.message||'播放失败')});
    return()=>{lease.current?.release();lease.current=null;};
  },[player]);
  useEffect(()=>{lease.current?.update({active:visible&&foreground&&!inactive&&!unavailable&&timed,tick:dt=>{const current=latest.current;invoke(current.api,{type:'scene',name:current.p.bind,scene:current.p.scene,event:'tick',payload:{dt}},message=>{setActionError(message);player.pause();});},error:error=>setActionError(error?.message||'播放失败')});},[player,visible,foreground,inactive,unavailable,timed]);
  useEffect(()=>()=>localPlayback.reset(),[localPlayback]);
  const eventAction = (event, payload) => { setActionError(''); invoke(api, { type: 'scene', name: p.bind, scene: p.scene, event, payload }, setActionError); };
  const pointerPoint = (svg, event, width, height) => {
    try {
      const matrix=svg.getScreenCTM();
      if (!matrix) return null;
      const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
      const mapped=point.matrixTransform(matrix.inverse());
      if (!Number.isFinite(mapped.x) || !Number.isFinite(mapped.y)) return null;
      return { x:Math.max(0,Math.min(width,mapped.x)), y:Math.max(0,Math.min(height,mapped.y)) };
    } catch { return null; }
  };
  const beginDrag = (id, event) => {
    if (inactive || unavailable || !visible || !foreground || !draggable || !event.isPrimary || event.button !== 0 || dragging.current) return;
    const target=event.currentTarget,svg=target.closest('svg');
    const start=svg && pointerPoint(svg,event,view.width,view.height);
    if (!start) return;
    // Every gesture writes through its captured generation-guarded API.
    const captured={api,scene:p.scene,bind:p.bind,player,sceneSignature,sourceVersion:api?.playbackVersion};
    const owner=gestureOwner.current;
    const gesture={id,pointerId:event.pointerId,pointerType:event.pointerType,target,svg,last:start,pending:null,timer:null,moved:false,finished:false,startClient:{x:event.clientX,y:event.clientY}};
    const sameSource=()=>{const current=latest.current;return current.player===captured.player && current.p.bind===captured.bind && current.sceneSignature===captured.sceneSignature && current.sourceVersion===captured.sourceVersion;};
    const removeListeners=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',end);
      window.removeEventListener('pointercancel',pointerCancel);
      window.removeEventListener('lostpointercapture',lostCapture);
      window.removeEventListener('blur',blur);
      document.removeEventListener('visibilitychange',visibility);
      target.removeEventListener('touchmove',preventTouchScroll);
    };
    const cleanup=()=>{
      if (gesture.finished) return;
      gesture.finished=true;clearTimeout(gesture.timer);gesture.timer=null;gesture.pending=null;
      removeListeners();
      if (dragging.current===gesture) dragging.current=null;
      target.removeAttribute('data-iui-dragging');
      // Keep cancelled pointers suppressed until their click or a fresh press;
      // a delayed mouseup after source replacement must not operate the new UI.
      if (gesture.moved || gesture.cancelled) {
        suppressClick.current.add(gesture.pointerId);
        // Browser input has only a handful of active pointers. Retire stale
        // cancelled tokens while bounding the lifetime of a mounted scene.
        if(suppressClick.current.size>64)suppressClick.current.delete(suppressClick.current.values().next().value);
      }
      try { if (target.hasPointerCapture(gesture.pointerId)) target.releasePointerCapture(gesture.pointerId); } catch {}
      captured.player.releaseGesture(owner);
    };
    const send=(phase,point,reportError=true)=>{
      if (phase!=='cancel' && !sameSource()) return false;
      const previous=gesture.last;
      const payload={id,x:point.x,y:point.y,dx:phase==='start'?0:point.x-previous.x,dy:phase==='start'?0:point.y-previous.y,phase};
      gesture.last=point;
      let accepted=true;
      invoke(captured.api,{type:'scene',name:captured.bind,scene:captured.scene,event:'drag',payload},message=>{
        accepted=false;
        if (reportError && mounted.current && sameSource()) setActionError(message);
        gesture.cancel(false);
      });
      return accepted;
    };
    const flush=()=>{
      clearTimeout(gesture.timer);gesture.timer=null;
      if (gesture.finished) return;
      if (!sameSource()) { gesture.cancel(false);return; }
      if (!latest.current.active || document.hidden) { gesture.cancel();return; }
      const point=gesture.pending;gesture.pending=null;
      if (point && (point.x!==gesture.last.x || point.y!==gesture.last.y)) send('move',point);
    };
    const track=event=>{
      if (Math.hypot(event.clientX-gesture.startClient.x,event.clientY-gesture.startClient.y)>4) gesture.moved=true;
      const point=pointerPoint(svg,event,view.width,view.height);
      if (point) gesture.pending=point;
    };
    function move(event) {
      if (event.pointerId!==gesture.pointerId || gesture.finished) return;
      if (!sameSource() || !latest.current.active || document.hidden) { gesture.cancel();return; }
      track(event);
      if (gesture.timer===null) gesture.timer=setTimeout(flush,33);
    }
    function end(event) {
      if (event.pointerId!==gesture.pointerId || gesture.finished) return;
      if (!sameSource() || !latest.current.active || document.hidden) { gesture.cancel();return; }
      track(event);flush();
      if (gesture.finished) return;
      const final=gesture.last;cleanup();send('end',final);
    }
    function pointerCancel(event) { if (event.pointerId===gesture.pointerId) gesture.cancel(); }
    function lostCapture(event) { if (event.pointerId===gesture.pointerId) gesture.cancel(); }
    function blur() { gesture.cancel(); }
    function visibility() { if (document.hidden) gesture.cancel(); }
    // SVG groups have no CSS layout box, so touch-action alone can still let
    // the browser pan and cancel the pointer stream. Block only moves from
    // the owned touch target; stationary taps and the surrounding page scroll.
    function preventTouchScroll(event) { if(!gesture.finished&&event.cancelable)event.preventDefault(); }
    gesture.cancel=(notify=true,suppress=true)=>{if(gesture.finished)return;gesture.cancelled=suppress;const final=gesture.last;cleanup();if(notify)send('cancel',final,false);};
    if (!player.claimGesture(owner,()=>gesture.cancel())) return;
    dragging.current=gesture;
    try { target.setPointerCapture(gesture.pointerId); }
    catch { gesture.cancel(false,false);return; }
    target.setAttribute('data-iui-dragging','true');
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',pointerCancel);
    window.addEventListener('lostpointercapture',lostCapture);
    window.addEventListener('blur',blur);
    document.addEventListener('visibilitychange',visibility);
    if(gesture.pointerType==='touch')target.addEventListener('touchmove',preventTouchScroll,{passive:false});
    event.stopPropagation();setActionError('');if(!send('start',start))gesture.cancel(false);
  };
  const click = (id, event, point) => {
    const pointerId=event?.nativeEvent?.pointerId??event?.pointerId;
    if(event?.detail>0&&suppressClick.current.size&&(pointerId===undefined||suppressClick.current.has(pointerId))){if(pointerId!==undefined)suppressClick.current.delete(pointerId);return;}
    if (inactive || !p.scene.events?.click) return;
    const payload = { id, ...point };
    const svg = container.current?.querySelector('.iui-scene-canvas');
    const mapped = event && svg && pointerPoint(svg, event, view.width, view.height);
    if (mapped) Object.assign(payload, mapped);
    eventAction('click', payload);
  };
  const activate=action=>{
    if(inactive||unavailable||action.disabled||!p.scene.events?.click||!visible||!foreground)return;
    player.cancelGesture();click(action.id,undefined);
  };
  const shortcut=event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    const action=view?.actions?.find(action=>action.shortcut?.toLowerCase()===event.key.toLowerCase());
    if(!action)return;
    event.preventDefault();event.stopPropagation();if(!event.repeat)activate(action);
  };
  return <section className="iui-scene" ref={container} aria-label={p.title || '交互场景'} tabIndex={!inactive&&hasShortcuts&&!view?.marks.length?0:undefined} onKeyDownCapture={shortcut} onKeyDown={event=>{
    const action=event.target.closest?.('[data-iui-scene-action]');
    if(!action||inactive||unavailable||!visible||!foreground||!p.scene.events?.key||['Tab','Enter',' '].includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;
    const card=view.actions?.find(item=>item.id===action.getAttribute('data-iui-scene-action'));
    if(!card||card.disabled||!p.scene.events?.click)return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault();
    eventAction('key',{key:event.key,id:action.getAttribute('data-iui-scene-action')});
  }}>
    {showTitle && p.title && <h3 id={titleId}>{p.title}</h3>}
    {!view || view.error ? <ErrorMessage>{view?.error || '场景服务尚未就绪'}</ErrorMessage> : (view.marks.length>0||!view.actions?.length) && <FigureViewport width={view.width} height={view.height} label={p.title || '交互场景'}><svg className="iui-scene-canvas" viewBox={`0 0 ${view.width} ${view.height}`} role="group" aria-label={p.title || '交互场景'} aria-describedby={hasHelp?`${titleId}-help`:undefined} tabIndex={inactive || !p.scene.events?.key ? undefined : 0} aria-disabled={inactive} onPointerDownCapture={event => { if (event.isPrimary && event.button===0) suppressClick.current.delete(event.pointerId); }} onClick={event => click('background', event)} onKeyDown={event => {
      if (inactive || !p.scene.events?.key || event.key === 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key)) event.preventDefault();
      eventAction('key', { key: event.key, id: event.target.closest?.('[data-iui-mark-id]')?.getAttribute('data-iui-mark-id') || 'scene' });
    }}>{view.marks.map(mark => <SceneMark key={mark.id} mark={mark} onClick={click} onPointerDown={beginDrag} draggable={draggable} inactive={inactive} keyboardEvents={Boolean(p.scene.events?.key)} />)}</svg></FigureViewport>}
    {view?.actions?.length>0&&!unavailable&&<div className="iui-scene-actions" data-compact={view.actions.every(action=>action.detail===undefined)} role="group" aria-label="场景操作">{view.actions.map((action,index)=><button key={action.id} type="button" className={`iui-scene-action${action.selected?' is-selected':''}`} data-iui-scene-action={action.id} aria-label={display(action.label)} aria-describedby={action.detail===undefined?undefined:`${titleId}-action-${index}`} aria-pressed={action.selected} aria-keyshortcuts={action.shortcut} disabled={inactive||action.disabled||!p.scene.events?.click} style={{'--iui-action-color':action.color?paint(action.color):'var(--iui-accent)'}} onClick={()=>activate(action)}>
      {action.symbol&&<span className="iui-scene-action-symbol" aria-hidden="true">{action.symbol}</span>}
      <span className="iui-scene-action-label">{display(action.label)}</span>
      {action.detail!==undefined&&<span className="iui-scene-action-detail" id={`${titleId}-action-${index}`}>{display(action.detail)}</span>}
      {action.shortcut&&<kbd aria-hidden="true">{action.shortcut}</kbd>}
    </button>)}</div>}
    <div className="iui-scene-toolbar">{controls && p.scene.events?.tick && <button type="button" className={`iui-button ${playing ? 'iui-button-secondary' : 'iui-button-primary'}`} disabled={inactive || Boolean(view?.error) || !view} aria-pressed={playing} onClick={() => { setActionError(''); player.toggle(); }}>{playing ? '暂停' : '播放'}</button>}{restartFields.length>0 && <button type="button" className="iui-button iui-button-secondary" title="保留当前参数，重新开始" disabled={inactive || !view || Boolean(view?.error)} onClick={() => { player.cancelGesture(); player.pause(); setActionError(''); invoke(api,{type:'sceneRestart',name:p.bind,scene:p.scene,fields:restartFields},setActionError); }}>重新开始</button>}<button type="button" className="iui-button iui-button-ghost" title="恢复全部初始设置" disabled={inactive || !view || Boolean(view?.error)} onClick={() => { player.cancelGesture(); player.pause(); eventAction('reset', {}); }}>重置</button>
      {hasHelp&&<details className="iui-scene-help"><summary role="button">操作说明</summary><p className="iui-hint" id={`${titleId}-help`}>{draggable && '拖动图形调整位置。'}{p.scene.events?.key && '聚焦场景或图形后可用键盘操作。'}{p.scene.events?.click && '点击图形或操作卡进行操作。'}{hasShortcuts&&'聚焦场景后，可按操作卡显示的按键。'}{timed && '离屏或离开页面后暂停。'}{restartFields.length>0 && '重新开始保留参数，重置恢复全部初始设置。'}</p></details>}
    </div>
    {actionError && <ErrorMessage>{actionError}</ErrorMessage>}
  </section>;
}

function SceneMetrics({ metrics, api, state, game }) {
  return <div className="iui-result-grid iui-scene-metrics" role={game ? 'status' : 'group'} aria-label={game ? '游戏指标' : '模拟指标'} aria-live={game ? 'polite' : undefined} aria-atomic={game ? true : undefined}>{metrics.map((item, index) => {
    const result=evaluate(api,item.formula,state);
    return <div className="iui-calculation-result" data-value-kind={typeof result.value==='number'?'number':'text'} data-long-value={typeof result.value==='string'&&result.value.length>8} key={index}><span className="iui-muted">{item.label}</span>{result.error ? <ErrorMessage>{result.error}</ErrorMessage> : <span className="iui-result-value">{formatNumber(result.value,item.precision??2)}{item.unit && <span>{item.unit}</span>}</span>}</div>;
  })}</div>;
}

function SceneExperience({ props: p, api, game = false }) {
  const fields=p.fields||[],metrics=p.metrics||[];
  const localPlayback=useMemo(()=>new ScenePlayback(),[]);
  const playback=api?.playback??localPlayback;
  const player=useMemo(()=>playback.get(p.bind),[playback,api?.playbackVersion,p.bind]);
  const sceneApi=api?.playback ? api : {...api,playback};
  // Dispose only the fallback owned by this experience, never the host service.
  useEffect(()=>()=>localPlayback.reset(),[localPlayback]);
  const [error,setError]=useState('');
  const definition=useMemo(()=>JSON.stringify(p.scene),[p.scene]);
  const current=useRef(null);
  current.current={player,definition,version:api?.playbackVersion};
  useEffect(()=>{current.current={player,definition,version:api?.playbackVersion};setError('');return()=>{current.current=null;};},[player,definition,api?.playbackVersion]);
  const view=deriveSceneView(sceneApi,p.scene,p.bind);
  const sceneState=view?.state||p.scene.initial;
  const parameterApi={...sceneApi,state:sceneState,set:(field,value)=>{
    if(disabled(api))return;
    const isCurrent=()=>current.current?.player===player&&current.current.definition===definition&&current.current.version===api?.playbackVersion;
    if(isCurrent())setError('');
    player.cancelGesture();player.pause();
    // Capture this render's guarded API and scene; stale controls cannot switch
    // to a newer source's API while a parameter update is being processed.
    invoke(api,{type:'sceneSet',name:p.bind,scene:p.scene,field,value},message=>{if(isCurrent())setError(message);});
  }};
  return <div className={game ? 'iui-game' : 'iui-simulation'}>
    {game&&<div className="iui-game-header"><div className="iui-game-heading">{p.title&&<h3>{p.title}</h3>}{p.instructions&&<p className="iui-text iui-text-sm iui-muted">{p.instructions}</p>}</div>{metrics.length>0&&<SceneMetrics metrics={metrics} api={api} state={sceneState} game />}</div>}
    <Scene props={p} api={sceneApi} view={view} restartFields={fields.map(field=>field.name)} showTitle={!game} />
    {!game&&metrics.length>0 && <SceneMetrics metrics={metrics} api={api} state={sceneState} />}
    {fields.length>0 && <div className="iui-form-fields iui-scene-parameters" role="group" aria-label={game ? '游戏参数' : '模拟参数'}>{fields.map(field=><InputControl key={field.name} props={{...field,bind:field.name}} api={parameterApi} kind={field.type||'number'} error={fieldError(field,sceneState[field.name]??field.value)} />)}</div>}
    {error && <ErrorMessage>{error}</ErrorMessage>}
  </div>;
}

export function Simulation({ props: p, api }) {
  return <SceneExperience props={p} api={api} />;
}
export function Game({ props: p, api }) {
  return <SceneExperience props={p} api={api} game />;
}
