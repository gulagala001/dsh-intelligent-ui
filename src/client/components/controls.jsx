import React, { useId, useState } from 'react';
import { disabled, display, ErrorMessage, Field, invoke, numeric, useBound } from './shared.jsx';

export function InputControl({ props: p, api, kind = 'text', error }) {
  const [value, set, updateError] = useBound(api, p.bind, p.value ?? (kind === 'checkbox' ? false : kind === 'number' || kind === 'slider' ? 0 : ''));
  const opts = (p.options || []).map(item => item && typeof item === 'object' ? item : { label: display(item), value: item });
  const inactive = disabled(api);
  return <Field label={p.label} hint={p.hint} error={error || updateError} unit={p.unit}>{attributes => {
    if (kind === 'checkbox') return <div className="iui-checkbox-line"><input {...attributes} className="iui-checkbox" type="checkbox" checked={Boolean(value)} disabled={inactive} onChange={event => set(event.target.checked)} /><span>{value ? '已选择' : '未选择'}</span></div>;
    if (kind === 'select') return <select {...attributes} className="iui-input iui-select" disabled={inactive} value={Math.max(-1, opts.findIndex(option => Object.is(option.value, value)))} onChange={event => set(opts[Number(event.target.value)]?.value)}>
      <option value={-1} disabled>请选择</option>{opts.map((option, index) => <option key={index} value={index} disabled={option.disabled}>{option.label}</option>)}
    </select>;
    if (kind === 'slider') {
      const min = p.min ?? 0, max = Math.max(min, p.max ?? 100);
      return <div className="iui-range-line"><input {...attributes} className="iui-slider" type="range" disabled={inactive} min={min} max={max} step={p.step ?? 1} value={Math.min(max, Math.max(min, numeric(value, min)))} onChange={event => set(event.target.valueAsNumber)} /><output htmlFor={attributes.id}>{numeric(value, min)}{p.unit && ` ${p.unit}`}</output></div>;
    }
    if (kind === 'textarea') return <textarea {...attributes} className="iui-input iui-textarea" disabled={inactive} value={display(value === null ? '' : value)} placeholder={p.placeholder} onChange={event => set(event.target.value)} rows={3} />;
    return <input {...attributes} className="iui-input" type={kind === 'number' ? 'number' : 'text'} inputMode={kind === 'number' ? 'decimal' : undefined} disabled={inactive} value={value ?? ''} min={p.min} max={p.max} step={p.step ?? (kind === 'number' ? 'any' : undefined)} placeholder={p.placeholder} onChange={event => set(kind === 'number' ? event.target.value === '' ? null : event.target.valueAsNumber : event.target.value)} />;
  }}</Field>;
}

export function Button({ props: p, api }) {
  const [error, setError] = useState('');
  return <div className="iui-button-wrap"><button className={`iui-button iui-button-${p.variant || 'primary'}`} type="button" disabled={disabled(api)} onClick={() => { setError(''); invoke(api, p.action, setError); }}>{p.label}</button>{error && <ErrorMessage>{error}</ErrorMessage>}</div>;
}

export function Counter({ props: p, api }) {
  const [value, set, error] = useBound(api, p.bind, p.value ?? 1);
  const amount = numeric(value, p.value ?? 1), min = p.min ?? 0, max = Math.max(min, p.max ?? 1000), step = p.step ?? 1;
  const id = useId();
  const change = direction => set(Math.round(Math.min(max, Math.max(min, amount + direction * step)) * 1e10) / 1e10);
  return <div className="iui-counter" role="group" aria-labelledby={id}><span className="iui-counter-label" id={id}>{p.label}</span><div className="iui-counter-controls"><button type="button" className="iui-counter-button" disabled={disabled(api) || amount <= min} aria-label={`减少${p.label}`} onClick={() => change(-1)}>−</button><div className="iui-counter-display"><output aria-live="polite" aria-label={p.label}>{amount}</output>{p.unit && <span>{p.unit}</span>}</div><button type="button" className="iui-counter-button" disabled={disabled(api) || amount >= max} aria-label={`增加${p.label}`} onClick={() => change(1)}>+</button></div>{error && <ErrorMessage>{error}</ErrorMessage>}</div>;
}

export function Checklist({ props: p, api }) {
  const [value, set, error] = useBound(api, p.bind, []);
  const checked = Array.isArray(value) ? value : [];
  const items = (p.items || []).map((item, index) => typeof item === 'string' ? { id: String(index), label: item } : item);
  const count = items.filter(item => checked.includes(item.id)).length;
  return <section className="iui-checklist" aria-label={p.title || '清单'}>
    <div className="iui-section-head">{p.title && <h3>{p.title}</h3>}<span className="iui-muted">{count} / {items.length} 完成</span></div>
    <div className="iui-progress" role="progressbar" aria-label="清单完成情况" aria-valuenow={count} aria-valuemin={0} aria-valuemax={items.length}><span style={{ width: `${items.length ? count / items.length * 100 : 0}%` }} /></div>
    <ul className="iui-checklist-items">{items.map(item => <li key={item.id} className={checked.includes(item.id) ? 'is-checked' : ''}><label><input className="iui-checkbox" type="checkbox" disabled={disabled(api)} checked={checked.includes(item.id)} onChange={event => set(event.target.checked ? [...checked.filter(id => id !== item.id), item.id] : checked.filter(id => id !== item.id))} /><span><span className="iui-checklist-label">{item.label}</span>{item.detail && <span className="iui-hint">{item.detail}</span>}</span></label></li>)}</ul>{error && <ErrorMessage>{error}</ErrorMessage>}
  </section>;
}

export function fieldValue(field, api) {
  return Object.prototype.hasOwnProperty.call(api?.state || {}, field.name) ? api.state[field.name] : field.value ?? (field.type === 'checkbox' ? false : field.type === 'text' || field.type === 'textarea' ? '' : field.type === 'select' ? undefined : 0);
}
export function fieldError(field, value) {
  if (field.required && (value === '' || value == null || field.type === 'checkbox' && !value)) return '请填写此项';
  if (field.type === 'select' && value != null && !field.options?.some(option => Object.is(option && typeof option === 'object' ? option.value : option, value))) return '请选择有效选项';
  if ((field.type === 'number' || field.type === 'slider') && value != null && value !== '') {
    if (!Number.isFinite(value)) return '请输入有效数字';
    if (field.min != null && value < field.min) return `不能小于 ${field.min}`;
    if (field.max != null && value > field.max) return `不能大于 ${field.max}`;
  }
  return '';
}

export function Form({ props: p, children, api }) {
  const [attempted, setAttempted] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const errors = p.fields.map(field => fieldError(field, fieldValue(field, api)));
  const formId = useId();
  return <form className="iui-form" noValidate aria-labelledby={p.title ? formId : undefined} aria-label={p.title ? undefined : '交互表单'} onSubmit={event => {
    event.preventDefault(); if (disabled(api)) return; setAttempted(true); setSubmissionError('');
    if (errors.some(Boolean)) { event.currentTarget.querySelectorAll('input,select,textarea')[errors.findIndex(Boolean)]?.focus(); return; }
    invoke(api, { type: 'submit', text: p.message || '请根据这些选择继续。', fields: p.fields.map(field => field.name) }, setSubmissionError);
  }}>
    {p.title && <h3 id={formId}>{p.title}</h3>}
    <div className="iui-form-fields">{p.fields.map((field, index) => <InputControl key={field.name} props={{ ...field, bind: field.name }} kind={field.type || 'number'} api={api} error={attempted ? errors[index] : undefined} />)}</div>
    {children}{attempted && errors.some(Boolean) && <ErrorMessage>请先修正标记的输入。</ErrorMessage>}{submissionError && <ErrorMessage>{submissionError}</ErrorMessage>}
    <button className="iui-button iui-button-primary" type="submit" disabled={disabled(api)}>{p.submitText || '提交'}</button>
  </form>;
}

export function Tabs({ props: p, children, api }) {
  const tabs = p.tabs.map(tab => typeof tab === 'string' ? { label: tab, value: tab } : tab);
  const [value, set, error] = useBound(api, p.bind, p.value ?? tabs[0]?.value);
  const selected = Math.max(0, tabs.findIndex(tab => tab.value === value));
  const id = useId();
  const content = React.Children.toArray(children);
  return <div className="iui-tabs"><div className="iui-tab-list" role="tablist" aria-label="内容分类">{tabs.map((tab, index) => <button key={tab.value} type="button" id={`${id}-tab-${index}`} role="tab" aria-selected={index === selected} aria-controls={`${id}-panel-${index}`} tabIndex={index === selected ? 0 : -1} disabled={disabled(api)} className="iui-tab" onClick={() => set(tab.value)} onKeyDown={event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined && !disabled(api)) { event.preventDefault(); set(tabs[next].value); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus(); }
  }}>{tab.label}</button>)}</div>{tabs.map((tab, index) => <div key={tab.value} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={index !== selected} tabIndex={0} className="iui-tab-panel">{content[index] || <span className="iui-muted">暂无内容</span>}</div>)}{error && <ErrorMessage>{error}</ErrorMessage>}</div>;
}
