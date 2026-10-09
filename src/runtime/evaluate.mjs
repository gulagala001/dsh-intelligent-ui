import { parseProgram, parseFormula } from '../protocol/parse.mjs';
import { LIMITS, UIError, assertJSON, badKey, budget } from './limits.mjs';
import { catalog } from '../catalog.mjs';
const trustedElements=new WeakSet();
export const isTrustedElement=value=>Boolean(value&&typeof value==='object'&&trustedElements.has(value));
const formulaCache=new Map();
export function evaluateFormula(source,environment,b=budget()) {
  let node=formulaCache.get(source);
  if(!node){node=parseFormula(source);if(formulaCache.size>=128)formulaCache.delete(formulaCache.keys().next().value);formulaCache.set(source,node);b.step(0,source.length);}
  return evaluateAST(node,{...environment,formula:true},b);
}

const number = value => { if(typeof value!=='number'&&(typeof value!=='string'||value.length>64||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(value)))throw new UIError('NUMBER','公式需要数字');const n = Number(value); if (!Number.isFinite(n)) throw new UIError('NUMBER', '公式需要有限数字'); return n; };
const scalarString=value=>{if(value!==null&&!['string','number','boolean','undefined'].includes(typeof value))throw new UIError('SCALAR','文字运算需要简单值');return String(value??'');};
function member(value, key) {
  if(!(typeof key==='string'&&key.length<=256||typeof key==='number'&&Number.isSafeInteger(key)))throw new UIError('INDEX','索引需要有限整数或短字符串');key = String(key); if (badKey(key)) throw new UIError('UNSAFE_KEY', '不支持此字段');
  if (key === 'length' && (typeof value === 'string' || Array.isArray(value))) return value.length;
  if (!value || typeof value !== 'object') return null;
  return Object.hasOwn(value, key) ? value[key] : null;
}
export function safePublicURL(value, origin = globalThis.location?.origin) {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.origin === origin || !host.includes('.') || /^(?:\d+\.){3}\d+$/.test(host) || host.includes(':') || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host) || url.port && url.port !== '443') throw new Error();
    return url.href;
  } catch { throw new UIError('URL', '图片需要公开静态 HTTPS 地址'); }
}
export function evaluateAST(node, environment = {}, b = budget(), depth = 0, path = 'root') {
  b.step(depth); if (!node) return null;
  const run = (n, suffix = '', locals = environment.locals) => evaluateAST(n, { ...environment, locals }, b, depth + 1, `${path}${suffix}`);
  const checked = value => { if (typeof value === 'number' && !Number.isFinite(value)) throw new UIError('NON_FINITE', '计算产生了无效数字'); if(typeof value==='string'){b.bytes=(b.bytes??0)+value.length;if(value.length>LIMITS.string||b.bytes>262144)throw new UIError('STRING_LIMIT','结果文字过长');} if (Array.isArray(value) && value.length > LIMITS.array) throw new UIError('DATA_LIMIT','结果数组过长'); return value; };
  switch (node.k) {
    case 'Str': case 'Num': case 'Bool': return checked(node.v);
    case 'Null': case 'Ph': return null;
    case 'Arr': return node.els.map((n, i) => run(n, `.${i}`));
    case 'Obj': return Object.fromEntries(node.entries.map(([key, n]) => { if (badKey(key)) throw new UIError('UNSAFE_KEY','不支持此字段'); return [key, run(n, `.${key}`)]; }));
    case 'StateRef': return member(environment.state ?? {}, node.n.replace(/^\$/, ''));
    case 'Ref': {
      if (badKey(node.n)) throw new UIError('UNSAFE_KEY','不支持此字段');
      if (Object.hasOwn(environment.locals ?? {}, node.n)) return environment.locals[node.n];
      if (Object.hasOwn(environment.state ?? {}, node.n)) return environment.state[node.n];
      const ref = environment.assignments?.[node.n];
      if (!ref) { if (environment.streaming) return null; throw new UIError('REFERENCE', `未定义变量 ${node.n}`); }
      if (b.active.has(node.n)) throw new UIError('CYCLE', '交互引用存在循环');
      b.active.add(node.n); try { return run(ref, `.${node.n}`); } finally { b.active.delete(node.n); }
    }
    case 'Member': return member(run(node.obj), node.field);
    case 'Index': return member(run(node.obj), run(node.index));
    case 'UnaryOp': { const v = run(node.operand); if (node.op === '!') return !v; if (node.op === '-') return checked(-number(v)); throw new UIError('OPERATOR','不支持的运算'); }
    case 'Ternary': return run(node.cond) ? run(node.then) : run(node.else);
    case 'BinOp': {
      const a = run(node.left); if (node.op === '&&') return a && run(node.right); if (node.op === '||') return a || run(node.right);
      const v = run(node.right);
      switch (node.op) {
        case '+': return checked(typeof a === 'string' || typeof v === 'string' ? scalarString(a) + scalarString(v) : number(a) + number(v));
        case '-': return checked(number(a) - number(v)); case '*': return checked(number(a) * number(v)); case '/': return checked(number(a) / number(v)); case '%': return checked(number(a) % number(v));
        case '==': case '===': return a === v; case '!=': case '!==': return a !== v;
        case '<': case '>': case '<=': case '>=': {let left,right;if(typeof a==='string'&&typeof v==='string'){b.step(depth,Math.ceil((a.length+v.length)/64));left=a;right=v;}else{left=number(a);right=number(v);}return node.op==='<'?left<right:node.op==='>'?left>right:node.op==='<='?left<=right:left>=right;}
        default: throw new UIError('OPERATOR','不支持的运算');
      }
    }
    case 'Comp': {
      const name = node.name.toLowerCase();
      if (name === 'each' || name === 'filter') {
        const list = run(node.args[0]); if (!Array.isArray(list) || list.length > LIMITS.array) throw new UIError('ARRAY','需要有界数组');
        const key = node.args[1]?.n ?? node.args[1]?.v;
        if (typeof key !== 'string' || badKey(key)) throw new UIError('NAME','集合运算需要局部变量');
        const result = [];
        for (let i = 0; i < list.length; i++) { const v = run(node.args[2], `.${i}`, { ...environment.locals, [key]: list[i], index: i }); if (name === 'each') result.push(v); else if (v) result.push(list[i]); }
        return result;
      }
      const args = node.args.map((n, i) => run(n, `.${i}`));
      const values = () => { const list = Array.isArray(args[0]) ? args[0] : args; b.step(depth,list.length); return list.map(number); };
      const unary = fn => checked(fn(number(args[0])));
      switch (name) {
        case 'abs': return unary(Math.abs); case 'floor': return unary(Math.floor); case 'ceil': return unary(Math.ceil); case 'sqrt': return unary(Math.sqrt); case 'sin': return unary(Math.sin); case 'cos': return unary(Math.cos); case 'tan': return unary(Math.tan); case 'log': return unary(Math.log); case 'exp': return unary(Math.exp);
        case 'round': { const p = Math.max(0,Math.min(10,number(args[1] ?? 0))), scale = 10 ** p; return checked(Math.round(number(args[0])*scale)/scale); }
        case 'pow': return checked(Math.pow(number(args[0]),number(args[1])));
        case 'mod': { const divisor = number(args[1]); return checked((number(args[0]) % divisor + divisor) % divisor); }
        case 'clamp': return Math.min(number(args[2]),Math.max(number(args[1]),number(args[0])));
        case 'min': return checked(Math.min(...values())); case 'max': return checked(Math.max(...values()));
        case 'sum': return checked(values().reduce((a,v)=>a+v,0)); case 'avg': { const v=values();return checked(v.reduce((a,x)=>a+x,0)/(v.length||1)); }
        case 'count': case 'len': return Array.isArray(args[0])||typeof args[0]==='string'?args[0].length:0; case 'first': return Array.isArray(args[0])||typeof args[0]==='string'?args[0][0]??null:null; case 'last': return Array.isArray(args[0])||typeof args[0]==='string'?args[0][args[0].length-1]??null:null;
        case 'concat': { if (Array.isArray(args[0])) { const out=args.flat();b.step(depth,out.length);return checked(out); } return checked(args.map(scalarString).join('')); }
        case 'range': { const start=args.length===1?0:number(args[0]),end=number(args.length===1?args[0]:args[1]),step=number(args[2]??1); if(!step)throw new UIError('RANGE','步长不能为零'); const length=Math.max(0,Math.ceil((end-start)/step));if(length>LIMITS.array)throw new UIError('DATA_LIMIT','范围过大');b.step(depth,length);return Array.from({length},(_,i)=>start+i*step); }
        case 'rand': if (!environment.random) throw new UIError('RANDOM','随机数仅支持显式场景事件'); return environment.random();
      }
      const def = catalog[node.name]; if (!def || environment.formula) throw new UIError('CALL', `未知函数或组件 ${node.name}`);
      if (++b.nodes > LIMITS.nodes) throw new UIError('NODE_LIMIT','组件过多');
      if (args.length > def.args.length) throw new UIError('PROPS',`${node.name} 参数过多`);
      const props = Object.fromEntries(def.args.filter((_,i)=>args[i]!==undefined).map((key,i)=>[key,args[i]]));
      const parsed = def.schema.safeParse(props);
      if (!parsed.success) { if (environment.streaming) {const pending={ name:'__pending', props:{label:node.name},path };trustedElements.add(pending);return pending;} throw new UIError('PROPS',`${node.name}: ${parsed.error.issues.map(x=>`${x.path.join('.')} ${x.message}`).slice(0,3).join('; ')}`); }
      if(def.children){const verifyChildren=(value,d)=>{b.step(d);if(value===null)return;if(Array.isArray(value)){for(const child of value)verifyChildren(child,d+1);return;}if(!isTrustedElement(value))throw new UIError('CHILD','布局只能包含已声明的组件');};verifyChildren(parsed.data[def.children],depth+1);}
      if (node.name === 'Image') {
        const dynamic = (n,seen=new Set()) => { b.step(depth); if(!n)return false;if(n.k==='StateRef')return true;if(n.k==='Ref'){if(Object.hasOwn(environment.state??{},n.n)||Object.hasOwn(environment.locals??{},n.n))return true;if(environment.assignments?.[n.n]){if(seen.has(n.n))throw new UIError('CYCLE','引用循环');seen.add(n.n);try{return dynamic(environment.assignments[n.n],seen);}finally{seen.delete(n.n);}}}return Object.values(n).some(v=>Array.isArray(v)?v.some(x=>x&&typeof x==='object'&&dynamic(x,seen)):v&&typeof v==='object'&&dynamic(v,seen)); };
        if (dynamic(node.args[0])) throw new UIError('URL_BINDING','图片地址不能绑定用户状态');
        parsed.data.src = safePublicURL(parsed.data.src);
      }
      const element={ name: node.name, props: parsed.data, path };trustedElements.add(element);return element;
    }
    default: throw new UIError('CALL','此表达式不能执行');
  }
}
export function safeEvaluate(source, state = {}, locals = {}, options = {}) {
  assertJSON(state); assertJSON(locals);
  return evaluateFormula(source,{state,locals,...options},options.budget??budget());
}
export function compile(source, options = {}) {
  const document = parseProgram(source, options), defaults = Object.create(null), b = budget();
  for (const [name, ast] of Object.entries(document.stateAST)) defaults[name] = evaluateAST(ast,{assignments:document.assignments,state:defaults,formula:true,streaming:document.streaming},b);
  document.defaults = assertJSON(defaults); return document;
}
export function evaluateDocument(document, state = {}) {
  assertJSON(state); const root=evaluateAST(document.root,{ assignments:document.assignments,state:{...document.defaults,...state},streaming:document.streaming },budget());if(root!==null&&!isTrustedElement(root))throw new UIError('ROOT','root需要是组件');return root;
}
