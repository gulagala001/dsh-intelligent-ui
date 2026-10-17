import { identityDigest } from './identity.mjs';
import { isTrustedElement } from './evaluate.mjs';
import { LIMITS, validName } from './limits.mjs';
import { catalog } from '../catalog.mjs';

const identity = value => JSON.stringify([typeof value, value], (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const counts = values => { const result = new Map(); for (const value of values) result.set(value, (result.get(value) || 0) + 1); return result; };

export function tableRowIdentities(rows, rowKey, digests) {
  const digest = value => {
    const text = identity(value);
    if (digests?.has(text)) return digests.get(text);
    const result = identityDigest(text);
    if (digests && digests.size < LIMITS.ops) digests.set(text, result);
    return result;
  };
  const keys = rows.map((row, index) => {
    const key = typeof rowKey === 'function' ? rowKey(row, index) : rowKey != null ? row[rowKey] : !Array.isArray(row) ? row.id : undefined;
    return key == null ? null : `key:${digest(key)}`;
  });
  const frequencies = counts(keys);
  return rows.map((row, index) => keys[index] != null && frequencies.get(keys[index]) === 1 ? keys[index] : `row:${digest(row)}`);
}

function tables(tree, digests, bindings) {
  const result = new Map(), visited = new Set();
  const walk = value => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (isTrustedElement(value) && value.name === 'Table' && validName(value.props.bind) && bindings.has(value.props.bind.replace(/^\$/, ''))) {
      const bind = value.props.bind.replace(/^\$/, '');
      const rows = tableRowIdentities(value.props.rows, value.props.rowKey, digests);
      result.set(bind + '\0' + value.path, { bind, rows, frequencies: counts(rows) });
    }
    if (Array.isArray(value)) value.forEach(walk);
    else if (isTrustedElement(value)) {
      const children = catalog[value.name]?.children;
      if (children) walk(value.props[children]);
    }
  };
  walk(tree);
  return result;
}

// Validate the public index before committing state or constructing a submit
// payload. A render effect cannot correct a payload already sent by an action.
export function reconcileTableSelections(tree, state, previousTree, previousState, explicitBindings = new Set()) {
  const bindings = new Set(Object.keys(state).filter(name => state[name] && typeof state[name] === 'object' && !Array.isArray(state[name]) && state[name].selected != null));
  const clear = new Set();
  if (!bindings.size) return { state, cleared: clear };
  const digests = new Map(), previous = tables(previousTree, digests, bindings), current = tables(tree, digests, bindings), chosen = new Map();
  const projections = counts([...current.values()].map(view => view.bind));
  for (const view of previous.values()) if (!projections.has(view.bind)) clear.add(view.bind);
  for (const [path, view] of current) {
    const selection = state[view.bind];
    if (!selection || typeof selection !== 'object' || Array.isArray(selection) || selection.selected == null) continue;
    const index = selection.selected, before = previous.get(path), old = previousState[view.bind];
    const priorViews = before ? [before] : [...previous.values()].filter(previousView => previousView.bind === view.bind);
    let fits = Number.isInteger(index) && index >= 0 && index < view.rows.length;
    if (selection.selectedIdentity != null && typeof selection.selectedIdentity !== 'string'
      || selection.selectedTransient != null && (typeof selection.selectedTransient !== 'string' || !selection.selectedTransient)) fits = false;
    if (fits && typeof selection.selectedIdentity === 'string') {
      fits = view.rows[index] === selection.selectedIdentity && view.frequencies.get(selection.selectedIdentity) === 1;
    } else if (fits && selection.selectedTransient) {
      fits = Boolean(before && projections.get(view.bind) === 1
        && (explicitBindings.has(view.bind) || old?.selected === index && old.selectedTransient === selection.selectedTransient)
        && JSON.stringify(before.rows) === JSON.stringify(view.rows));
    } else if (fits && !explicitBindings.has(view.bind) && priorViews.length && old?.selected === index) {
      // Legacy numeric state has no saved identity. The previous evaluated
      // projection supplies evidence until an explicit new selection is made.
      fits = priorViews.every(previousView => previousView.rows[index] === view.rows[index]
        && (previousView.frequencies.get(previousView.rows[index]) === 1 && view.frequencies.get(view.rows[index]) === 1
          || JSON.stringify(previousView.rows) === JSON.stringify(view.rows)));
    }
    if (fits) {
      const record = view.rows[index];
      if (chosen.has(view.bind) && chosen.get(view.bind) !== record) fits = false;
      else chosen.set(view.bind, record);
    }
    if (!fits) clear.add(view.bind);
  }
  if (!clear.size) return { state, cleared: clear };
  const next = { ...state };
  for (const bind of clear) next[bind] = { ...state[bind], selected: null, selectedIdentity: null, selectedTransient: null };
  return { state: next, cleared: clear };
}
