import React, { useId, useRef, useState } from 'react';
import { disabled, display, ErrorMessage, formatNumber, numeric, paint, palette, useBound } from './shared.jsx';
import { FigureViewport } from './FigureViewport.jsx';

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
    <tbody>{sorted.map(({ row, index }) => <tr key={index} className={view.selected === index ? 'is-selected' : ''}>{p.bind && <td><button type="button" disabled={disabled(api)} className="iui-row-select" aria-label={`选择第 ${index + 1} 行`} aria-pressed={view.selected === index} onClick={() => set({ ...view, selected: view.selected === index ? null : index })}>{view.selected === index ? '●' : '○'}</button></td>}{columns.map(column => <td key={column.index} className={`iui-cell-${column.align || 'left'}${typeof get(row,column)==='number'?' iui-cell-numeric':''}`}>{cell(get(row, column), column.format)}</td>)}</tr>)}</tbody>
  </table>{!p.rows.length && <p className="iui-empty">暂无数据</p>}{error && <ErrorMessage>{error}</ErrorMessage>}</div>;
}

function arc(cx, cy, radius, start, end) {
  const x1 = cx + radius * Math.cos(start), y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end), y2 = cy + radius * Math.sin(end);
  if (end - start >= Math.PI * 2 - 0.00001) return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius} Z`;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}
const colors = Object.keys(palette);
const unitSuffix = (label, unit) => unit && [`（${unit}）`, `(${unit})`, ` ${unit}`].find(suffix => label.endsWith(suffix));
const seriesLabel = entry => !entry.unit || entry.label === entry.unit || unitSuffix(entry.label, entry.unit) ? entry.label : `${entry.label}（${entry.unit}）`;
const unitGroupLabel = group => {
  if (group.entries.length === 1 && group.unit) return seriesLabel(group.entries[0]);
  const labels = group.entries.map(entry => {
    const suffix = unitSuffix(entry.label, group.unit);
    return suffix ? entry.label.slice(0, -suffix.length).trimEnd() : entry.label;
  });
  return `${labels.join(' / ')}（${group.unit || '未标注单位'}）`;
};
let selectionSequence = 0;
// Preserve types and object key order independence for JSON-backed category IDs.
const valueIdentity = value => JSON.stringify([typeof value, value], (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const chartGlyphWidth = character => /[^\u0000-\u00ff]|[MWmw@%]/.test(character) ? 12 : 8;
const chartTextWidth = text => Array.from(text).reduce((sum, character) => sum + chartGlyphWidth(character), 0);
const counts = values => values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map());
export function Chart({ props: p, api }) {
  const [state, set, error] = useBound(api, p.bind, { hidden: [], selected: null });
  const [hover, setHover] = useState(null);
  const [viewWidth, setViewWidth] = useState(640);
  const selectionEvidence = useRef(null);
  const stateObj = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const hidden = Array.isArray(stateObj.hidden) ? stateObj.hidden : [];
  // Index-only category filters from unreleased builds cannot be migrated safely:
  // discard them rather than apply an old position to a different category.
  const hiddenCategories = Array.isArray(stateObj.hiddenCategories) ? stateObj.hiddenCategories.filter(value => typeof value === 'string' && value.startsWith('category:')) : [];
  // Equal typed category labels form one filter group, including duplicate rows.
  // A unique explicit row.id identifies selection; duplicate labels without IDs
  // fall back to a unique full row, or an unchanged dataset for identical rows.
  const categories = p.data.map(row => `category:${valueIdentity(row[p.x])}`);
  const baseRows = p.data.map((row, index) => Object.hasOwn(row, 'id') ? `id:${valueIdentity(row.id)}` : categories[index]);
  const baseCounts = counts(baseRows);
  const rowIdentities = p.data.map((row, index) => baseCounts.get(baseRows[index]) === 1 ? baseRows[index] : `row:${valueIdentity(row)}`);
  const rowCounts = counts(rowIdentities), dataLayout = valueIdentity(p.data);
  const resolveSelection = (identity, index, transient) => {
    if (transient) {
      const evidence = selectionEvidence.current;
      return evidence?.token === transient && evidence.layout === dataLayout && evidence.index === index ? index : null;
    }
    return typeof identity === 'string' && rowCounts.get(identity) === 1 ? rowIdentities.indexOf(identity) : null;
  };
  const series = p.series.map((entry, index) => typeof entry === 'string' ? { key: entry, label: entry, unit: '', color: colors[index % colors.length] } : { ...entry, unit: entry.unit?.trim() || '', color: entry.color || colors[index % colors.length] });
  const pie = p.type === 'pie';
  const filterCategories = pie || p.categoryFilters === true, colorByCategory = p.colorBy === 'category';
  const categoryIndexes = new Map();
  categories.forEach((identity, index) => { if (!categoryIndexes.has(identity)) categoryIndexes.set(identity, index); });
  const categoryGroups = [...categoryIndexes.entries()].map(([identity, index]) => ({ identity, index, label: display(p.data[index][p.x]) }));
  // Order by typed identity so reordered views agree, and keep the first six
  // categories distinct. Filtering uses the full data set, so colors stay put.
  const categoryColors = new Map([...categoryIndexes.keys()].sort().map((identity, index) => [identity, colors[index % colors.length]]));
  const hiddenCategorySet = new Set(hiddenCategories);
  const categoryVisible = index => !filterCategories || !hiddenCategorySet.has(categories[index]);
  const visibleRows = p.data.map((row, index) => ({ row, index })).filter(({ index }) => categoryVisible(index));
  const visiblePositions = new Map(visibleRows.map(({ index }, position) => [index, position]));
  const visibleCategoryCount = categoryGroups.filter(group => !hiddenCategorySet.has(group.identity)).length;
  const categoryPaint = index => paint(colorByCategory ? categoryColors.get(categories[index]) : colors[(p.categoryFilters ? categoryIndexes.get(categories[index]) : index) % colors.length]);
  const markPaint = (index, entry) => colorByCategory ? categoryPaint(index) : paint(entry.color);
  const unitGroups = [];
  for (const entry of series) {
    let group = unitGroups.find(group => group.unit === entry.unit);
    if (!group) { group = { unit: entry.unit, entries: [] }; unitGroups.push(group); }
    group.entries.push(entry);
  }
  // A stale unit is projected into the first authored group, never repaired by
  // a render-time state write. Unitless legacy series still form a single group.
  const unitGroup = unitGroups.find(group => group.unit === stateObj.unit) || unitGroups[0];
  const groupSeries = pie ? series : unitGroup?.entries || [];
  const visible = groupSeries.filter(entry => !hidden.includes(entry.key));
  // Older documents use hidden for series. Keep that state and choose a visible
  // metric until an explicit metric is saved; categories use their own state.
  const metric = series.find(entry => entry.key === stateObj.metric) || visible[0];
  const plotted = pie ? metric ? [metric] : [] : visible;
  const pieValue = row => Math.max(0, numeric(row[metric?.key]));
  const total = pie && metric ? p.data.reduce((sum, row, index) => sum + (categoryVisible(index) ? pieValue(row) : 0), 0) : 0;
  const percent = row => `${formatNumber(total > 0 ? pieValue(row) / total * 100 : 0, 1)}%`;
  const id = useId();
  const W = viewWidth, H = W < 420 ? 240 : 320, right = W < 420 ? 16 : 20, top = 20, bottom = 48;
  const values = visibleRows.flatMap(({ row }) => plotted.map(entry => numeric(row[entry.key])));
  const min = Math.min(0, ...values), max = Math.max(1, ...values), range = max - min;
  const ticks = Array.from({ length: 5 }, (_, index) => min + range * index / 4);
  const tickLabel = value => { const full = formatNumber(value, 1); return W < 420 && full.length > 9 ? value.toExponential(1) : full; };
  const axisWidth = Math.max(...ticks.map(value => chartTextWidth(tickLabel(value)))) + 14;
  const left = Math.min(Math.max(56, axisWidth), Math.max(40, W * .4));
  const plotWidth = Math.max(1, W - left - right), plotHeight = H - top - bottom;
  const y = value => top + (max - numeric(value)) / range * plotHeight;
  const xValues = p.type === 'scatter' ? visibleRows.map(({ row }) => numeric(row[p.x])) : [];
  const xMin = Math.min(0, ...xValues), xMax = Math.max(1, ...xValues);
  const x = index => p.type === 'scatter' ? left + (numeric(p.data[index][p.x]) - xMin) / (xMax - xMin) * plotWidth : p.type === 'bar' ? left + (visiblePositions.get(index) + 0.5) / Math.max(1, visibleRows.length) * plotWidth : left + visiblePositions.get(index) / Math.max(1, visibleRows.length - 1) * plotWidth;
  // Label slots follow this viewport, not the authored 640px canvas. Keep
  // complete category text in SVG titles and the accessible raw data table.
  const labelCount = Math.max(2, Math.min(8, Math.floor(plotWidth / 52)));
  const axisRows = p.type === 'scatter' ? [...visibleRows].sort((a, b) => x(a.index) - x(b.index)).filter((item, position, rows) => position === 0 || x(item.index) !== x(rows[position - 1].index)) : visibleRows;
  const slots = Math.min(labelCount, axisRows.length);
  const labelRows = Array.from({ length: slots }, (_value, slot) => axisRows[Math.round(slot * (axisRows.length - 1) / Math.max(1, slots - 1))]).reduce((rows, item, position) => {
    if (!rows.length || x(item.index) - x(rows.at(-1).index) >= 32) rows.push(item);
    else if (position === slots - 1 && rows.length > 1) { rows.pop(); rows.push(item); }
    return rows;
  }, []);
  const categoryLabel = (row, index, position) => {
    const center = x(index), previous = position > 0 ? x(labelRows[position - 1].index) : 0, next = position + 1 < labelRows.length ? x(labelRows[position + 1].index) : W;
    const anchor = p.type !== 'bar' && labelRows.length > 1 ? position === 0 ? 'start' : position === labelRows.length - 1 ? 'end' : 'middle' : 'middle';
    const available = Math.max(12, anchor === 'start' ? (next - center) / 2 - 6 : anchor === 'end' ? (center - previous) / 2 - 6 : Math.min(center - previous, next - center) - 10);
    const full = display(row[p.x]);
    if (chartTextWidth(full) <= available) return { text: full, full, anchor };
    let used = 0, text = '';
    for (const character of full) {
      if (used + chartGlyphWidth(character) > available - 12) break;
      used += chartGlyphWidth(character); text += character;
    }
    return { text: text + '…', full, anchor };
  };
  const savedSelection = resolveSelection(stateObj.selectedIdentity, stateObj.selected, stateObj.selectedTransient);
  const previewSelection = hover && (rowCounts.get(hover.identity) === 1 ? rowIdentities.indexOf(hover.identity) : hover.layout === dataLayout && rowIdentities[hover.index] === hover.identity ? hover.index : null);
  const projectedSelection = (previewSelection >= 0 ? previewSelection : null) ?? savedSelection;
  const selected = projectedSelection != null && categoryVisible(projectedSelection) ? projectedSelection : null;
  const transientSelection = index => rowCounts.get(rowIdentities[index]) > 1 || rowIdentities[index].length > 8192;
  const selectionFields = index => ({ selected: index, selectedIdentity: index == null || transientSelection(index) ? null : rowIdentities[index], selectedTransient: index != null && transientSelection(index) ? selectionEvidence.current?.token || null : null, selectedLayout: null });
  const preview = index => setHover(previous => previous?.identity === rowIdentities[index] && previous.index === index && previous.layout === dataLayout ? previous : { identity: rowIdentities[index], index, layout: dataLayout });
  const select = index => {
    if (disabled(api)) return;
    const next = savedSelection === index ? null : index;
    // Ambiguous identical rows or unusually large identities stay usable in this
    // mounted chart. Only an opaque token is saved; reload clears that selection
    // because there is no durable evidence for which identical row was chosen.
    selectionEvidence.current = next != null && transientSelection(next) ? { token: `mounted-selection:${++selectionSequence}`, index: next, layout: dataLayout } : null;
    setHover(null); set({ ...stateObj, ...selectionFields(next) });
  };
  const clear = () => { setHover(null); set({ ...stateObj, ...selectionFields(null) }); };
  const toggleCategory = index => {
    if (disabled(api)) return;
    const identity = categories[index], hiding = !hiddenCategorySet.has(identity);
    const clearSelection = hiding && savedSelection != null && categories[savedSelection] === identity;
    if (clearSelection) selectionEvidence.current = null;
    setHover(null);
    set({ ...stateObj, hiddenCategories: hiding ? [...hiddenCategories, identity] : hiddenCategories.filter(value => value !== identity), ...(clearSelection ? selectionFields(null) : {}) });
  };
  // selected is the row position at the last explicit gesture; each view
  // projects selectedIdentity into its own order without writing shared state.
  const pointChart = ['line', 'area', 'scatter'].includes(p.type);
  const nearestPoint = event => {
    const svg = event.currentTarget.closest('svg'), matrix = svg?.getScreenCTM();
    if (!matrix) return null;
    let nearest = null, best = Infinity;
    for (const mark of svg.querySelectorAll('[data-chart-cx]')) {
      const cx = Number(mark.dataset.chartCx), cy = Number(mark.dataset.chartCy);
      const dx = matrix.a * cx + matrix.c * cy + matrix.e - event.clientX;
      const dy = matrix.b * cx + matrix.d * cy + matrix.f - event.clientY;
      const distance = dx * dx + dy * dy;
      if (distance < best - 0.0001 || (Math.abs(distance - best) <= 0.0001 && mark === event.currentTarget)) { best = distance; nearest = mark; }
    }
    return nearest;
  };
  const selectedRow = p.data[selected];
  const label = (index, entry) => `${display(p.data[index][p.x])}，${seriesLabel(entry)}：${formatNumber(p.data[index][entry.key])}${pie ? `，占比 ${percent(p.data[index])}` : ''}`;
  const markProps = (index, entry) => ({
    className: `iui-chart-mark${selected === index ? ' is-selected' : ''}`,
    role: 'button', tabIndex: disabled(api) ? -1 : 0,
    'aria-label': label(index, entry), 'aria-pressed': savedSelection === index,
    'aria-disabled': disabled(api), 'data-chart-row': index, 'data-chart-series': entry.key,
    ...(pointChart ? { 'data-chart-cx': x(index), 'data-chart-cy': y(p.data[index][entry.key]) } : {}),
    onMouseEnter: event => preview(pointChart ? Number(nearestPoint(event)?.dataset.chartRow ?? index) : index),
    onMouseMove: event => { if (pointChart) preview(Number(nearestPoint(event)?.dataset.chartRow ?? index)); },
    onMouseLeave: () => setHover(null), onFocus: () => preview(index), onBlur: () => setHover(null),
    onClick: event => {
      const nearest = pointChart && event.detail > 0 ? nearestPoint(event) : null;
      if (nearest && nearest !== event.currentTarget && !disabled(api)) nearest.focus();
      select(nearest ? Number(nearest.dataset.chartRow) : index);
    },
    onKeyDown: event => {
      if (disabled(api)) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(index); }
      else if (event.key === 'Escape') { event.preventDefault(); clear(); }
      else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const marks = [...event.currentTarget.closest('svg').querySelectorAll('[data-chart-row]')].filter(mark => mark.dataset.chartSeries === entry.key);
        const current = marks.indexOf(event.currentTarget);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? marks.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + marks.length) % marks.length;
        marks[next]?.focus();
      }
    },
  });
  const point = (row, index, entry, radius) => <g key={index} {...markProps(index, entry)}>
    <circle cx={x(index)} cy={y(row[entry.key])} r={selected === index ? radius + 2 : radius} fill={markPaint(index, entry)} />
    <circle className="iui-chart-point-hit" cx={x(index)} cy={y(row[entry.key])} r={radius + 2} fill="transparent" stroke="transparent" strokeWidth="24" vectorEffect="non-scaling-stroke" />
    <title>{label(index, entry)}</title>
  </g>;
  let pieAngle = -Math.PI / 2;
  const tabTitle = p.title || '图表';
  return <figure className="iui-chart">
    {p.title && <figcaption className="iui-chart-title" id={`${id}-title`}>{p.title}</figcaption>}
    {pie && (series.length > 1 || !metric) && <label className="iui-chart-metric">显示指标<select disabled={disabled(api)} value={metric?.key || ''} onChange={event => { if (disabled(api)) return; setHover(null); set({ ...stateObj, metric: event.target.value, hidden: hidden.filter(key => key !== event.target.value) }); }}>
      {!metric && <option value="" disabled>请选择指标</option>}{series.map(entry => <option key={entry.key} value={entry.key}>{seriesLabel(entry)}</option>)}
    </select></label>}
    {!pie && unitGroups.length > 1 && <label className="iui-chart-metric">显示指标<select disabled={disabled(api)} value={unitGroup.unit} onChange={event => { if (disabled(api)) return; setHover(null); set({ ...stateObj, unit: event.target.value }); }}>
      {unitGroups.map(group => <option key={group.unit} value={group.unit}>{unitGroupLabel(group)}</option>)}
    </select></label>}
    {(!pie || !p.categoryFilters) && <div className="iui-chart-legend" aria-label={pie ? '选择显示的数据分类' : '选择显示的数据系列'}>{pie ? p.data.map((row, index) => <button key={index} className="iui-chart-legend-item" type="button" disabled={disabled(api)} aria-pressed={categoryVisible(index)} onClick={() => toggleCategory(index)}><span style={{ background: categoryPaint(index) }} />{display(row[p.x])}<span className="iui-chart-legend-value">{metric ? `${formatNumber(row[metric.key])}${metric.unit ? ` ${metric.unit}` : ''} · ${categoryVisible(index) ? percent(row) : '已隐藏'}` : '未选指标'}</span></button>) : groupSeries.map(entry => <button key={entry.key} className="iui-chart-legend-item" type="button" disabled={disabled(api)} aria-pressed={!hidden.includes(entry.key)} onClick={() => { if (disabled(api)) return; setHover(null); set({ ...stateObj, hidden: hidden.includes(entry.key) ? hidden.filter(key => key !== entry.key) : [...hidden, entry.key] }); }}><span style={{ background: paint(colorByCategory ? 'gray' : entry.color) }} />{seriesLabel(entry)}</button>)}</div>}
    {p.categoryFilters && <details className="iui-chart-categories" open><summary>数据分类 <span className="iui-chart-category-count">{visibleCategoryCount}/{categoryGroups.length}</span></summary><div className="iui-chart-category-list" role="group" aria-label="选择显示的数据分类">{categoryGroups.map(group => <button key={group.identity} className="iui-chart-category-item iui-chart-legend-item" type="button" disabled={disabled(api)} aria-pressed={!hiddenCategorySet.has(group.identity)} onClick={() => toggleCategory(group.index)}><span style={{ background: pie || colorByCategory ? categoryPaint(group.index) : paint('gray') }} />{group.label}</button>)}</div></details>}
    <div className="iui-chart-canvas"><FigureViewport width={640} height={320} label={tabTitle} onWidthChange={setViewWidth}><svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${tabTitle}，${visibleRows.length} 个${filterCategories ? '可见' : ''}数据点`} aria-describedby={`${id}-description ${id}-help`}>
      {colorByCategory && ['line', 'area'].includes(p.type) && visibleRows.length > 0 && <defs><linearGradient id={`${id}-category-colors`} x1={x(visibleRows[0].index)} x2={Math.max(x(visibleRows[0].index) + 1, x(visibleRows[visibleRows.length - 1].index))} y1="0" y2="0" gradientUnits="userSpaceOnUse">{visibleRows.map(({ index }, position) => <stop key={index} offset={position / Math.max(1, visibleRows.length - 1)} stopColor={categoryPaint(index)} />)}</linearGradient></defs>}
      {!pie && visibleRows.length > 0 && <>
        {ticks.map((value, index) => <g key={index}><line x1={left} y1={y(value)} x2={W - right} y2={y(value)} className="iui-chart-gridline" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="iui-chart-label">{tickLabel(value)}{tickLabel(value) !== formatNumber(value, 1) && <title>{formatNumber(value, 1)}</title>}</text></g>)}
        {labelRows.map(({ row, index }, position) => { const value = categoryLabel(row, index, position); return <text key={index} data-chart-axis="x" x={x(index)} y={H - 18} textAnchor={value.anchor} className="iui-chart-label">{value.text}{value.text !== value.full && <title>{value.full}</title>}</text>; })}
      </>}
      {(p.type === 'line' || p.type === 'area') && visible.map(entry => {
        const points = visibleRows.map(({ row, index }) => `${x(index)},${y(row[entry.key])}`).join(' ');
        const pathPaint = colorByCategory ? `url(#${id}-category-colors)` : paint(entry.color);
        return visibleRows.length > 0 && <g key={entry.key}>{p.type === 'area' && visibleRows.length > 1 && <polygon points={`${x(visibleRows[0].index)},${y(0)} ${points} ${x(visibleRows[visibleRows.length - 1].index)},${y(0)}`} fill={pathPaint} opacity="0.12" />}<polyline points={points} fill="none" stroke={pathPaint} strokeWidth="2.5" strokeLinejoin="round" />{visibleRows.map(({ row, index }) => point(row, index, entry, 3))}</g>;
      })}
      {p.type === 'bar' && visible.map((entry, seriesIndex) => visibleRows.map(({ row, index }) => {
        const barWidth = Math.max(1, plotWidth / Math.max(1, visibleRows.length) * 0.7 / Math.max(1, visible.length));
        const valueY = y(row[entry.key]), zeroY = y(0), barX = x(index) - visible.length * barWidth / 2 + seriesIndex * barWidth;
        return <g key={`${entry.key}-${index}`} {...markProps(index, entry)}><rect x={barX} y={Math.min(zeroY, valueY)} width={Math.max(0.5, barWidth - 2)} height={Math.max(0.5, Math.abs(valueY - zeroY))} rx="2" fill={markPaint(index, entry)} opacity={selected != null && selected !== index ? 0.55 : 1} /><rect className="iui-chart-point-hit" x={barX} y={Math.min(zeroY, valueY) - 2} width={Math.max(0.5, barWidth - 2)} height={Math.max(4, Math.abs(valueY - zeroY))} fill="transparent" stroke="transparent" strokeWidth="16" vectorEffect="non-scaling-stroke" /><title>{label(index, entry)}</title></g>;
      }))}
      {p.type === 'scatter' && visible.map(entry => <g key={entry.key}>{visibleRows.map(({ row, index }) => point(row, index, entry, 5))}</g>)}
      {pie && total > 0 && p.data.map((row, index) => {
        if (!categoryVisible(index) || pieValue(row) <= 0) return null;
        const start = pieAngle; pieAngle += pieValue(row) / total * Math.PI * 2;
        return <path key={index} {...markProps(index, metric)} d={arc(W / 2, H / 2, Math.max(1, Math.min(120, W / 2 - 16, H / 2 - 20)), start, pieAngle)} fill={categoryPaint(index)} stroke="var(--iui-surface)" strokeWidth="3" opacity={selected != null && selected !== index ? 0.55 : 1}><title>{label(index, metric)}</title></path>;
      })}
      {pie && total === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" className="iui-chart-label">{!p.data.length ? '暂无数据' : metric ? '当前分类没有正数数据' : '请选择显示指标'}</text>}
      {!pie && !visibleRows.length && <text x={W / 2} y={H / 2} textAnchor="middle" className="iui-chart-label">{p.data.length ? '请开启至少一个数据分类' : '暂无数据'}</text>}
    </svg></FigureViewport></div>
    <div className="iui-chart-description" id={`${id}-description`} aria-live="polite">{selectedRow ? <><strong>{display(selectedRow[p.x])}</strong>{plotted.map(entry => <span key={entry.key}>{seriesLabel(entry)}：{formatNumber(selectedRow[entry.key])}{pie && categoryVisible(selected) && ` · ${percent(selectedRow)}`}</span>)}{savedSelection != null && <button type="button" className="iui-chart-clear" disabled={disabled(api)} onClick={clear}>取消选择</button>}</> : <span className="iui-muted">{!p.data.length ? '暂无数据' : !visibleRows.length ? '请开启至少一个数据分类' : !plotted.length ? '请开启至少一个数据系列' : '点击图形或数据行，查看具体数值'}</span>}</div>
    <span className="iui-visually-hidden" id={`${id}-help`}>图形可使用方向键切换数据点，Enter 或空格选择，再次选择或 Escape 取消；下方可查看完整数据。</span>
    <details className="iui-chart-data"><summary>查看数据</summary><div className="iui-table-scroll"><table className="iui-table"><caption className="iui-visually-hidden">{tabTitle}原始数据</caption><thead><tr><th scope="col">{p.x}</th>{series.map(entry => <th scope="col" key={entry.key}>{seriesLabel(entry)}</th>)}</tr></thead><tbody>{p.data.map((row, index) => <tr key={index} className={savedSelection === index ? 'is-selected' : ''}><th scope="row"><button type="button" className="iui-data-select" disabled={disabled(api)} aria-pressed={savedSelection === index} onClick={() => select(index)}>{display(row[p.x])}</button></th>{series.map(entry => <td key={entry.key}>{formatNumber(row[entry.key])}</td>)}</tr>)}</tbody></table></div></details>
    {error && <ErrorMessage>{error}</ErrorMessage>}
  </figure>;
}
