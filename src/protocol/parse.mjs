import { tokenize, split, parseExpression, autoClose } from '@openuidev/lang-core';
import { LIMITS, UIError, badKey, validName, budget } from '../runtime/limits.mjs';
import { verifyExpression } from './syntax.mjs';

// These low-level OpenUI exports do not invoke its parser/runtime telemetry or evaluator.
export function checkedTokens(source, { streaming = false } = {}) {
  if (typeof source !== 'string' || source.length > LIMITS.source) throw new UIError('SOURCE_LIMIT', '交互内容过长');
  let depth = 0, unary = 0, quote = null, comment = false; const brackets=[],cleaned=source.split('');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (comment) { if (c === '\n') comment = false;else cleaned[i]=' '; continue; }
    if (quote) { if (c === '\\') { i++; continue; } if (c === quote) quote = null; continue; }
    if (c === '/' && source[i + 1] === '/') { comment = true; cleaned[i]=' ';cleaned[i+1]=' ';i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if ('([{'.includes(c)) { brackets.push(c);if (++depth > LIMITS.depth) throw new UIError('DEPTH', '交互内容嵌套过深'); }
    else if (')]}'.includes(c)) { if (--depth < 0 || brackets.pop() !== {'\u0029':'(',']':'[','}':'{'}[c]) throw new UIError('SYNTAX', '括号不匹配'); }
    if ('!-'.includes(c)) { if (++unary > LIMITS.depth) throw new UIError('DEPTH', '表达式过深'); } else if (!/\s/.test(c)) unary = 0;
    if (!/[A-Za-z0-9_$\s()[\]{},.:;+*/%!?<>=&|\-]/.test(c)) throw new UIError('SYNTAX', `不支持的符号 ${c}`);
  }
  if (!streaming && (depth || quote)) throw new UIError('INCOMPLETE', '交互内容尚未完整');
  const commentFree=cleaned.join('');const closed = streaming ? autoClose(commentFree).text : commentFree;
  const tokens = tokenize(closed);
  if (tokens.length > LIMITS.tokens) throw new UIError('TOKEN_LIMIT', '交互内容项目过多');
  // OpenUI's full parser normally tags builtins before parsing; use the same call tag.
  for (let i = 0; i < tokens.length - 1; i++) if ((tokens[i].t === 16 || tokens[i].t === 17) && tokens[i + 1].t === 1) tokens[i].t = 35;
  return tokens;
}
export function parseFormula(source) {
  if (typeof source !== 'string' || source.length > 4000) throw new UIError('FORMULA_LIMIT', '公式过长');
  const tokens = checkedTokens(source).filter(t => t.t !== 0 && t.t !== 13);
  if (!tokens.length || tokens.some(t => t.t === 9)) throw new UIError('FORMULA', '公式必须是纯表达式');
  return parseExpression(verifyExpression(tokens));
}
export function parseProgram(source, { streaming = false } = {}) {
  const marker=typeof source==='string'&&source.match(/^\s*\/\/\s*iui:([^\r\n]*)/);if(marker&&marker[1].trim()!=='1')throw new UIError('PROTOCOL','此作品使用了尚未支持的协议版本');
  const tokens=checkedTokens(source,{streaming}),rows = split(tokens);
  if(tokens.filter(t=>t.t!==0&&t.t!==13).length!==rows.reduce((n,row)=>n+2+row.tokens.filter(t=>t.t!==0&&t.t!==13).length,0))throw new UIError('SYNTAX','交互声明格式不正确');
  if (rows.length > LIMITS.statements) throw new UIError('STATEMENT_LIMIT', '交互声明过多');
  const assignments = Object.create(null), states = Object.create(null);
  for (const row of rows) {
    if (!validName(row.id)) throw new UIError('NAME', '无效的变量名称');
    const isState = row.id.startsWith('$'); const table = isState ? states : assignments;
    const key = isState ? row.id.slice(1) : row.id;
    if (Object.hasOwn(table, key)) throw new UIError('DUPLICATE', `变量 ${row.id} 重复`);
    try { table[key] = parseExpression(verifyExpression(row.tokens)); }
    catch(error){if(streaming&&row===rows.at(-1))continue;throw error;}
  }
  if (!assignments.root && !streaming) throw new UIError('ROOT', '需要 root = 组件(...)');
  const b = budget();
  const visit = (node, d = 0) => {
    b.step(d); if (!node || typeof node !== 'object') throw new UIError('SYNTAX', '无效表达式');
    if (node.k === 'Obj') for (const [key, value] of node.entries) { if (badKey(key)) throw new UIError('UNSAFE_KEY', '不支持此字段'); visit(value, d + 1); }
    else if (node.k === 'Comp') { if (['Query','Mutation','Run','OpenUrl','ToAssistant','Action','Set','Reset'].includes(node.name)) throw new UIError('CALL', `不支持 ${node.name}；使用组件的显式 action`); for (const a of node.args) visit(a, d + 1); }
    else if (node.k === 'Arr') { if (node.els.length > LIMITS.array) throw new UIError('DATA_LIMIT', '数组过长'); for (const a of node.els) visit(a, d + 1); }
    else if (node.k === 'Member') { if (badKey(node.field)) throw new UIError('UNSAFE_KEY', '不支持此字段'); visit(node.obj, d + 1); }
    else if (node.k === 'Index') { visit(node.obj, d + 1); visit(node.index, d + 1); }
    else if (node.k === 'Assign' || node.k === 'RuntimeRef') throw new UIError('CALL', '表达式不能改变状态或调用工具');
    else if (node.k === 'BinOp') { visit(node.left,d+1);visit(node.right,d+1); }
    else if (node.k === 'UnaryOp') visit(node.operand,d+1);
    else if (node.k === 'Ternary') { visit(node.cond,d+1);visit(node.then,d+1);visit(node.else,d+1); }
    else if (!['Str','Num','Bool','Null','Ref','StateRef','Ph'].includes(node.k)) throw new UIError('SYNTAX', '不支持此表达式');
  };
  for (const node of [...Object.values(assignments),...Object.values(states)]) visit(node);
  return { root: assignments.root ?? null, assignments, stateAST: states, source, streaming, diagnostics: [] };
}
