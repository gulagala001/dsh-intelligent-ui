import React, { useEffect, useId, useRef, useState } from 'react';
import { fieldError, fieldValue, InputControl } from './controls.jsx';
import { disabled, display, ErrorMessage, evaluate, formatNumber, invoke, numeric, paint, useBound } from './shared.jsx';

function Result({ result, label, unit, precision = 2 }) {
  return <div className="iui-calculation-result"><span className="iui-muted">{label}</span>{result.error ? <ErrorMessage>{result.error}</ErrorMessage> : <output className="iui-result-value">{formatNumber(result.value, precision)}{unit && <span>{unit}</span>}</output>}</div>;
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
  return <figure className="iui-diagram">{p.title && <figcaption className="iui-chart-title">{p.title}</figcaption>}<svg viewBox={`0 0 ${width} ${fullHeight}`} role="group" aria-label={p.title || '交互示意图'}>
    <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--iui-muted)" /></marker></defs>
    {p.edges.map((edge, index) => {
      const from = nodes.find(node => node.id === edge.from), to = nodes.find(node => node.id === edge.to);
      if (!from || !to) return null;
      const distance = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const dx = (to.x - from.x) / distance, dy = (to.y - from.y) / distance;
      return <g key={index}><line x1={from.x + dx * 65} y1={from.y + dy * 25} x2={to.x - dx * 70} y2={to.y - dy * 30} stroke="var(--iui-muted)" strokeWidth="1.5" markerEnd={`url(#${id}-arrow)`} />{edge.label && <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 10} textAnchor="middle" className="iui-chart-label">{edge.label}</text>}</g>;
    })}
    {nodes.map(node => <g key={node.id} role="button" tabIndex={inactive ? -1 : 0} aria-label={node.label} aria-pressed={selected === node.id} aria-disabled={inactive} className={`iui-diagram-node ${selected === node.id ? 'is-selected' : ''}`} onClick={() => set(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); set(node.id); } }}><rect x={node.x - 72} y={node.y - 28} width="144" height="56" rx="12" /><text x={node.x} y={node.y + 5} textAnchor="middle">{node.label.length > 12 ? `${node.label.slice(0, 12)}…` : node.label}</text></g>)}
  </svg><div className="iui-diagram-detail" aria-live="polite">{chosen ? <><strong>{chosen.label}</strong><p>{chosen.detail || '暂无补充说明'}</p></> : <span className="iui-muted">选择节点查看说明。</span>}</div>{error && <ErrorMessage>{error}</ErrorMessage>}</figure>;
}

function SceneMark({ mark, onClick, inactive }) {
  const properties = { fill: mark.fill === undefined ? paint('blue') : paint(mark.fill), stroke: mark.stroke === undefined ? 'none' : paint(mark.stroke, 'gray'), strokeWidth: Math.max(0, Math.min(20, numeric(mark.strokeWidth, 1.5))), opacity: Math.max(0, Math.min(1, numeric(mark.opacity, 1))) };
  const coordinate = value => Math.max(-10000, Math.min(10000, numeric(value)));
  let element;
  if (mark.type === 'circle') element = <circle {...properties} cx={coordinate(mark.x)} cy={coordinate(mark.y)} r={Math.max(0, Math.min(2000, numeric(mark.r, 8)))} />;
  if (mark.type === 'rect') element = <rect {...properties} x={coordinate(mark.x)} y={coordinate(mark.y)} width={Math.max(0, Math.min(4000, numeric(mark.width, 40)))} height={Math.max(0, Math.min(4000, numeric(mark.height, 40)))} rx="4" />;
  if (mark.type === 'line') element = <line {...properties} x1={coordinate(mark.x)} y1={coordinate(mark.y)} x2={coordinate(mark.x2)} y2={coordinate(mark.y2)} stroke={mark.stroke ? paint(mark.stroke, 'gray') : paint('gray')} />;
  if (mark.type === 'text') element = <text {...properties} x={coordinate(mark.x)} y={coordinate(mark.y)} fontSize={Math.min(96, Math.max(8, numeric(mark.fontSize, 16)))}>{display(mark.text)}</text>;
  if (mark.type === 'path') element = <polyline {...properties} fill={mark.fill ? paint(mark.fill) : 'none'} stroke={mark.stroke ? paint(mark.stroke) : paint('blue')} points={Array.isArray(mark.points) ? mark.points.slice(0, 1000).filter(point => Array.isArray(point) && point.length === 2).map(point => `${coordinate(point[0])},${coordinate(point[1])}`).join(' ') : ''} />;
  return <g data-iui-mark-id={mark.id} className={mark.interactive ? 'iui-scene-target' : undefined} role={mark.interactive ? 'button' : undefined} tabIndex={mark.interactive && !inactive ? 0 : undefined} aria-label={mark.label || (mark.interactive ? mark.id : undefined)} aria-disabled={mark.interactive ? inactive : undefined} onClick={mark.interactive ? event => { event.stopPropagation(); onClick(mark.id, event); } : undefined} onKeyDown={mark.interactive ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onClick(mark.id, undefined, { x: numeric(mark.x) + (mark.type === 'rect' ? numeric(mark.width) / 2 : 0), y: numeric(mark.y) + (mark.type === 'rect' ? numeric(mark.height) / 2 : 0) }); } } : undefined}>{element}{mark.label && <title>{mark.label}</title>}</g>;
}

export function Scene({ props: p, api, controls = true }) {
  const container = useRef(null);
  const latest = useRef({ api, p });
  latest.current = { api, p };
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [actionError, setActionError] = useState('');
  const inactive = disabled(api);
  const titleId = useId();
  let view;
  try { view = api?.sceneView?.(p.scene, p.bind); } catch (error) { view = { error: error?.message || '场景无法显示' }; }
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
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { threshold: 0.01 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const unavailable = !view || Boolean(view.error);
  const timed = Boolean(p.scene.events?.tick);
  useEffect(() => { if (inactive || unavailable) setPlaying(false); }, [inactive, unavailable]);
  useEffect(() => {
    if (!playing || !visible || !foreground || inactive || unavailable || !timed) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      const current = latest.current;
      invoke(current.api, { type: 'scene', name: current.p.bind, scene: current.p.scene, event: 'tick', payload: { dt } }, message => { setActionError(message); setPlaying(false); });
    }, 34);
    return () => clearInterval(timer);
  }, [playing, visible, foreground, inactive, unavailable, p.bind, timed]);
  const eventAction = (event, payload) => { setActionError(''); invoke(api, { type: 'scene', name: p.bind, scene: p.scene, event, payload }, setActionError); };
  const click = (id, event, point) => {
    if (inactive || !p.scene.events?.click) return;
    const bounds = container.current?.querySelector('svg')?.getBoundingClientRect();
    const payload = { id, ...point };
    if (event && bounds?.width && bounds?.height) {
      const scale = Math.min(bounds.width / view.width, bounds.height / view.height);
      payload.x = (event.clientX - bounds.left - (bounds.width - view.width * scale) / 2) / scale;
      payload.y = (event.clientY - bounds.top - (bounds.height - view.height * scale) / 2) / scale;
    }
    eventAction('click', payload);
  };
  return <section className="iui-scene" ref={container} aria-label={p.title || '交互场景'}>
    {p.title && <h3 id={titleId}>{p.title}</h3>}
    {!view || view.error ? <ErrorMessage>{view?.error || '场景服务尚未就绪'}</ErrorMessage> : <svg className="iui-scene-canvas" viewBox={`0 0 ${view.width} ${view.height}`} role="group" aria-label={p.title || '交互场景'} aria-describedby={`${titleId}-help`} tabIndex={inactive || !p.scene.events?.key ? undefined : 0} aria-disabled={inactive} onClick={event => click('background', event)} onKeyDown={event => {
      if (inactive || !p.scene.events?.key || event.key === 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key)) event.preventDefault();
      eventAction('key', { key: event.key, id: event.target.closest?.('[data-iui-mark-id]')?.getAttribute('data-iui-mark-id') || 'scene' });
    }}>{view.marks.map(mark => <SceneMark key={mark.id} mark={mark} onClick={click} inactive={inactive} />)}</svg>}
    <div className="iui-scene-toolbar">{controls && p.scene.events?.tick && <button type="button" className={`iui-button ${playing ? 'iui-button-secondary' : 'iui-button-primary'}`} disabled={inactive || Boolean(view?.error) || !view} aria-pressed={playing} onClick={() => { setActionError(''); setPlaying(value => !value); }}>{playing ? '暂停' : '播放'}</button>}<button type="button" className="iui-button iui-button-ghost" disabled={inactive || !view || Boolean(view?.error)} onClick={() => { setPlaying(false); eventAction('reset', {}); }}>重置</button><span className="iui-hint" id={`${titleId}-help`}>{p.scene.events?.key ? '可使用键盘操作。' : '点击图形进行操作。'}{p.scene.events?.tick && '播放时更新，离开页面后暂停。'}</span></div>
    {actionError && <ErrorMessage>{actionError}</ErrorMessage>}
  </section>;
}

export function Simulation({ props: p, api }) {
  let view;
  try { view = api?.sceneView?.(p.scene, p.bind); } catch (error) { view = { error: error?.message || '场景无法显示' }; }
  const [error, setError] = useState('');
  const sceneState = view?.state || p.scene.initial;
  const parameterApi = { ...api, state: sceneState, set: (field, value) => invoke(api, { type: 'sceneSet', name: p.bind, scene: p.scene, field, value }, setError) };
  return <div className="iui-simulation"><Scene props={p} api={api} />{p.fields?.length > 0 && <div className="iui-form-fields">{p.fields.map(field => <InputControl key={field.name} props={{ ...field, bind: field.name }} api={parameterApi} kind={field.type || 'number'} error={fieldError(field, sceneState[field.name] ?? field.value)} />)}</div>}{error && <ErrorMessage>{error}</ErrorMessage>}{p.metrics?.length > 0 && <div className="iui-result-grid">{p.metrics.map((item, index) => <Result key={index} result={evaluate(api, item.formula, sceneState)} {...item} />)}</div>}</div>;
}
export function Game({ props: p, api }) {
  return <div className="iui-game">{p.instructions && <p className="iui-text iui-text-sm iui-muted">{p.instructions}</p>}<Scene props={p} api={api} /></div>;
}
