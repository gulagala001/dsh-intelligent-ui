import React, { useId, useState } from 'react';

export const disabled = api => Boolean(api?.disabled || api?.streaming);
export const display = value => value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
export const palette = { blue: '#0285ff', green: '#008635', orange: '#e25507', purple: '#924ff7', red: '#e02e2a', gray: '#767676' };
export function paint(value, fallback = 'blue') {
  return palette[value] || (typeof value === 'string' && /^(#[a-f\d]{3}|#[a-f\d]{6}|#[a-f\d]{8}|black|white|none|transparent|currentColor)$/i.test(value) ? value : palette[fallback]);
}
export function useBound(api, name, initial) {
  const [local, setLocal] = useState(initial);
  const [error, setError] = useState('');
  const widget = !name && api?.componentPath && api?.widget && api?.setWidget;
  const value = name && Object.prototype.hasOwnProperty.call(api?.state || {}, name) ? api.state[name] : widget ? api.widget(api.componentPath,initial) : local;
  const set = next => {
    if (disabled(api)) return;
    setError('');
    try {
      if (name) {
        if (!api?.set) throw new Error('状态服务尚未就绪');
        const result = api.set(name, next);
        if (result?.catch) result.catch(failure => setError(failure?.message || '设置未更新'));
      } else if(widget){
        const result=api.setWidget(api.componentPath,next);
        if(result?.catch)result.catch(failure=>setError(failure?.message||'设置未更新'));
      } else setLocal(next);
    } catch (failure) { setError(failure?.message || '设置未更新'); }
  };
  return [value, set, error];
}
export function ErrorMessage({ children }) {
  return <div className="iui-error" role="alert">{children}</div>;
}
export function Field({ label, hint, error, children, unit }) {
  const id = useId();
  const described = hint || error ? `${id}-help` : undefined;
  return <div className="iui-field">
    <label className="iui-label" htmlFor={id}>{label}{unit && <span className="iui-muted"> · {unit}</span>}</label>
    {children({ id, 'aria-describedby': described, 'aria-invalid': Boolean(error) })}
    {(hint || error) && <span id={described} role={error ? 'alert' : undefined} className={error ? 'iui-field-error' : 'iui-hint'}>{error || hint}</span>}
  </div>;
}
export function numeric(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function formatNumber(value, precision = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return display(value);
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: precision }).format(value);
}
export function invoke(api, action, onError) {
  if (disabled(api)) return;
  try {
    const result = api?.action?.(action);
    if (result?.catch) result.catch(error => onError?.(error?.message || '操作未完成'));
  } catch (error) { onError?.(error?.message || '操作未完成'); }
}
export function evaluate(api, expression, locals) {
  try {
    if (!api?.evaluate) return { error: '计算服务尚未就绪' };
    const value = api.evaluate(expression, locals);
    if (typeof value === 'number' && !Number.isFinite(value)) return { error: '请检查输入范围' };
    return { value };
  } catch (error) { return { error: error?.message || '无法计算，请检查输入' }; }
}
