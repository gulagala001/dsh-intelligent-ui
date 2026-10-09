import React, { useId, useState } from 'react';
import { disabled, display, ErrorMessage, formatNumber, numeric, paint, palette, useBound } from './shared.jsx';

function cell(value, format) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return display(value);
  if (format === 'percent') return new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 }).format(value);
  if (format === 'currency') return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(value);
  return format === 'number' ? formatNumber(value) : display(value);
}
export function Table({ props: p, api }) {
  const [state, set, error] = useBound(api, p.bind, { sort: null, direction: 'asc', selected: null });
  const view = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const columns = p.columns.map((column, index) => typeof column === 'string' ? { key: column, label: column, index } : { ...column, index });
  const get = (row, column) => Array.isArray(row) ? row[column.index] : row[column.key];
  const sorted = p.rows.map((row, index) => ({ row, index }));
  const sortColumn = columns.find(column => column.key === view.sort);
  if (sortColumn) sorted.sort((a, b) => {
    const av = get(a.row, sortColumn), bv = get(b.row, sortColumn);
    const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : display(av).localeCompare(display(bv), 'zh-CN', { numeric: true });
    return (view.direction === 'desc' ? -1 : 1) * result || a.index - b.index;
  });
  return <div className="iui-table-scroll" tabIndex={0} role="region" aria-label={p.caption || '数据表格'}><table className="iui-table">
    {p.caption && <caption>{p.caption}</caption>}
    <thead><tr>{p.bind && <th scope="col" className="iui-table-selection">选择</th>}{columns.map(column => <th key={column.index} scope="col" className={`iui-cell-${column.align || 'left'}`} aria-sort={view.sort === column.key ? view.direction === 'desc' ? 'descending' : 'ascending' : 'none'}><button className="iui-table-sort" type="button" disabled={disabled(api)} onClick={() => set({ ...view, sort: column.key, direction: view.sort === column.key && view.direction !== 'desc' ? 'desc' : 'asc' })}>{column.label}<span aria-hidden="true">{view.sort === column.key ? view.direction === 'desc' ? ' ↓' : ' ↑' : ' ↕'}</span></button></th>)}</tr></thead>
    <tbody>{sorted.map(({ row, index }) => <tr key={index} className={view.selected === index ? 'is-selected' : ''}>{p.bind && <td><button type="button" disabled={disabled(api)} className="iui-row-select" aria-label={`选择第 ${index + 1} 行`} aria-pressed={view.selected === index} onClick={() => set({ ...view, selected: view.selected === index ? null : index })}>{view.selected === index ? '●' : '○'}</button></td>}{columns.map(column => <td key={column.index} className={`iui-cell-${column.align || 'left'}`}>{cell(get(row, column), column.format)}</td>)}</tr>)}</tbody>
  </table>{!p.rows.length && <p className="iui-empty">暂无数据</p>}{error && <ErrorMessage>{error}</ErrorMessage>}</div>;
}

function arc(cx, cy, radius, start, end) {
  const x1 = cx + radius * Math.cos(start), y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end), y2 = cy + radius * Math.sin(end);
  if (end - start >= Math.PI * 2 - 0.00001) return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius} Z`;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}
const colors = Object.keys(palette);
export function Chart({ props: p, api }) {
  const [state, set, error] = useBound(api, p.bind, { hidden: [], selected: null });
  const [hover, setHover] = useState(null);
  const stateObj = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const hidden = Array.isArray(stateObj.hidden) ? stateObj.hidden : [];
  const series = p.series.map((entry, index) => typeof entry === 'string' ? { key: entry, label: entry, color: colors[index % colors.length] } : { ...entry, color: entry.color || colors[index % colors.length] });
  const visible = series.filter(entry => !hidden.includes(entry.key));
  const id = useId();
  const W = 640, H = 320, left = 56, right = 20, top = 20, bottom = 48;
  const plotWidth = W - left - right, plotHeight = H - top - bottom;
  const values = p.data.flatMap(row => visible.map(entry => numeric(row[entry.key])));
  const min = Math.min(0, ...values), max = Math.max(1, ...values), range = max - min;
  const y = value => top + (max - numeric(value)) / range * plotHeight;
  const xValues = p.type === 'scatter' ? p.data.map(row => numeric(row[p.x])) : [];
  const xMin = Math.min(0, ...xValues), xMax = Math.max(1, ...xValues);
  const x = index => p.type === 'scatter' ? left + (numeric(p.data[index][p.x]) - xMin) / (xMax - xMin) * plotWidth : p.type === 'bar' ? left + (index + 0.5) / Math.max(1, p.data.length) * plotWidth : left + index / Math.max(1, p.data.length - 1) * plotWidth;
  const selected = hover ?? stateObj.selected;
  const select = index => set({ ...stateObj, selected: index });
  const selectedRow = p.data[selected];
  let pieAngle = -Math.PI / 2;
  const total = p.type === 'pie' && visible[0] ? p.data.reduce((sum, row) => sum + Math.max(0, numeric(row[visible[0].key])), 0) : 0;
  const tabTitle = p.title || '图表';
  return <figure className="iui-chart">
    {p.title && <figcaption className="iui-chart-title" id={`${id}-title`}>{p.title}</figcaption>}
    <div className="iui-chart-legend" aria-label="选择显示的数据系列">{series.map(entry => <button key={entry.key} className="iui-chart-legend-item" type="button" disabled={disabled(api)} aria-pressed={!hidden.includes(entry.key)} onClick={() => set({ ...stateObj, hidden: hidden.includes(entry.key) ? hidden.filter(key => key !== entry.key) : [...hidden, entry.key] })}><span style={{ background: paint(entry.color) }} />{entry.label}</button>)}</div>
    <div className="iui-chart-canvas"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${tabTitle}，${p.data.length} 个数据点；下方可查看完整数据`} aria-describedby={`${id}-description`}>
      {p.type !== 'pie' && <>
        {Array.from({ length: 5 }, (_, index) => { const value = min + range * index / 4; return <g key={index}><line x1={left} y1={y(value)} x2={W - right} y2={y(value)} className="iui-chart-gridline" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="iui-chart-label">{formatNumber(value, 1)}</text></g>; })}
        {p.data.map((row, index) => (index % Math.max(1, Math.ceil(p.data.length / 8)) === 0 || index === p.data.length - 1) && <text key={index} x={x(index)} y={H - 18} textAnchor="middle" className="iui-chart-label">{display(row[p.x]).slice(0, 14)}</text>)}
      </>}
      {(p.type === 'line' || p.type === 'area') && visible.map(entry => {
        const points = p.data.map((row, index) => `${x(index)},${y(row[entry.key])}`).join(' ');
        return <g key={entry.key}>{p.type === 'area' && p.data.length > 1 && <polygon points={`${x(0)},${y(0)} ${points} ${x(p.data.length - 1)},${y(0)}`} fill={paint(entry.color)} opacity="0.12" />}<polyline points={points} fill="none" stroke={paint(entry.color)} strokeWidth="2.5" strokeLinejoin="round" />{p.data.map((row, index) => <circle key={index} cx={x(index)} cy={y(row[entry.key])} r={selected === index ? 5 : 3} fill={paint(entry.color)} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} />)}</g>;
      })}
      {p.type === 'bar' && visible.map((entry, seriesIndex) => p.data.map((row, index) => {
        const barWidth = Math.max(1, plotWidth / Math.max(1, p.data.length) * 0.7 / Math.max(1, visible.length));
        const valueY = y(row[entry.key]), zeroY = y(0);
        return <rect key={`${entry.key}-${index}`} x={x(index) - visible.length * barWidth / 2 + seriesIndex * barWidth} y={Math.min(zeroY, valueY)} width={Math.max(0.5, barWidth - 2)} height={Math.max(0.5, Math.abs(valueY - zeroY))} rx="2" fill={paint(entry.color)} opacity={selected != null && selected !== index ? 0.55 : 1} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} />;
      }))}
      {p.type === 'scatter' && visible.map(entry => p.data.map((row, index) => <circle key={`${entry.key}-${index}`} cx={x(index)} cy={y(row[entry.key])} r={selected === index ? 7 : 5} fill={paint(entry.color)} opacity="0.8" onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} />))}
      {p.type === 'pie' && total > 0 && p.data.map((row, index) => { const start = pieAngle; pieAngle += Math.max(0, numeric(row[visible[0].key])) / total * Math.PI * 2; return <path key={index} d={arc(W / 2, H / 2, 120, start, pieAngle)} fill={paint(colors[index % colors.length])} stroke="var(--iui-surface)" strokeWidth="3" opacity={selected != null && selected !== index ? 0.55 : 1} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} />; })}
    </svg></div>
    <div className="iui-chart-description" id={`${id}-description`} aria-live="polite">{selectedRow ? <><strong>{display(selectedRow[p.x])}</strong>{visible.map(entry => <span key={entry.key}>{entry.label}：{formatNumber(selectedRow[entry.key])}</span>)}</> : <span className="iui-muted">{!p.data.length ? '暂无数据' : !visible.length ? '请开启至少一个数据系列' : '选择下方数据行，查看具体数值'}</span>}</div>
    <details className="iui-chart-data"><summary>查看数据</summary><div className="iui-table-scroll"><table className="iui-table"><caption className="iui-visually-hidden">{tabTitle}原始数据</caption><thead><tr><th scope="col">{p.x}</th>{series.map(entry => <th scope="col" key={entry.key}>{entry.label}</th>)}</tr></thead><tbody>{p.data.map((row, index) => <tr key={index} className={selected === index ? 'is-selected' : ''}><th scope="row"><button type="button" className="iui-data-select" disabled={disabled(api)} aria-pressed={stateObj.selected === index} onClick={() => select(index)}>{display(row[p.x])}</button></th>{series.map(entry => <td key={entry.key}>{formatNumber(row[entry.key])}</td>)}</tr>)}</tbody></table></div></details>
    {error && <ErrorMessage>{error}</ErrorMessage>}
  </figure>;
}
