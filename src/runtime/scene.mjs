import { sceneSchema } from '../catalog.mjs';
import { evaluateFormula } from './evaluate.mjs';
import { assertJSON, UIError, budget, badKey, LIMITS } from './limits.mjs';

const colors = new Set(['blue','green','orange','purple','red','gray','black','white','transparent','none','currentColor']);
const SCENE_LIMITS={...LIMITS,ops:8000};
let pageWindow = 0, pageOps = 0;
function charge(b) {
  const now = Date.now(); if (now - pageWindow >= 1000) { pageWindow = now; pageOps = 0; }
  pageOps += b.ops; if (pageOps > 240000) throw new UIError('PAGE_BUDGET','请暂停部分动画后继续');
}
export function initialScene(scene) { return assertJSON({ values: structuredClone(scene.initial), seed: scene.seed ?? 1 },SCENE_LIMITS); }
function currentScene(scene, value) {
  const parsed = sceneSchema.parse(scene);
  if (!value) return { scene: parsed, record:initialScene(parsed) };
  assertJSON(value,SCENE_LIMITS);
  if (!value.values || typeof value.values !== 'object' || Array.isArray(value.values) || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 4294967295) throw new UIError('SCENE_STATE','场景状态无效');
  return { scene: parsed, record: { values: { ...parsed.initial,...value.values }, seed: value.seed } };
}
function sceneBudget() { return budget({ source:128000,tokens:24000,statements:512,depth:40,ops:12000,nodes:1000,array:2000,string:32000,stateBytes:131072,stateKeys:256 }); }
export function sceneView(scene, record) {
  const next = currentScene(scene, record), b = sceneBudget();
  const marks = next.scene.marks.map(mark => {
    const out = {};
    for (const [key,value] of Object.entries(mark)) {
      const v = value && typeof value === 'object' && Object.hasOwn(value,'expr') ? evaluateFormula(value.expr,{state:next.record.values,locals:{}},b) : value;
      if (['x','y','x2','y2','width','height','r','strokeWidth','opacity','fontSize'].includes(key)) {
        if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v)>10000 || ['width','height','r','strokeWidth','fontSize'].includes(key)&&v<0 || key==='opacity'&&(v<0||v>1) || key==='fontSize'&&v>128 || key==='strokeWidth'&&v>32) throw new UIError('GEOMETRY','图形参数超出范围');
      }
      if (['fill','stroke'].includes(key) && !(typeof v==='string'&&(colors.has(v)||/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(v)))) throw new UIError('COLOR','图形颜色无效');
      if (key==='points' && (!Array.isArray(v)||v.length>1000||v.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>10000)))) throw new UIError('GEOMETRY','路径数据无效');
      if (key==='text' && !['string','number','boolean'].includes(typeof v)) throw new UIError('TEXT','图形文字无效');
      out[key] = v;
    }
    return out;
  });
  charge(b); return { state:next.record.values,marks,width:next.scene.width,height:next.scene.height };
}
export function sceneTransition(scene, record, event, payload = {}) {
  return transition(scene,record,event,payload);
}
export function sceneRestart(scene, record, fields = []) {
  if(!Array.isArray(fields)||fields.length>100||fields.some(name=>typeof name!=='string'||badKey(name)))throw new UIError('SCENE_FIELD','重新开始需要有效的参数列表');
  return transition(scene,record,'reset',{},fields.length?[...new Set(fields)]:undefined);
}
function transition(scene, record, event, payload = {}, preservedFields) {
  const next=currentScene(scene,event==='reset'&&!preservedFields?undefined:record), b=sceneBudget();
  if (!['tick','click','key','reset','drag'].includes(event)) throw new UIError('EVENT','场景事件无效');
  assertJSON(payload); const allowed = event==='drag'?['id','x','y','dx','dy','phase']:['id','x','y','key','dt'];
  if (Object.keys(payload).some(k=>!allowed.includes(k))) throw new UIError('EVENT','场景事件字段无效');
  if (payload.key!==undefined && (typeof payload.key!=='string'||payload.key.length>32)) throw new UIError('EVENT','键盘事件无效');
  for (const key of ['x','y','dt']) if(payload[key]!==undefined && (typeof payload[key]!=='number'||!Number.isFinite(payload[key]))) throw new UIError('EVENT','场景事件数字无效');
  if(event==='drag'){
    if(typeof payload.id!=='string'||!payload.id.length||payload.id.length>128||!['start','move','end','cancel'].includes(payload.phase))throw new UIError('EVENT','拖拽事件目标或阶段无效');
    for(const key of ['x','y','dx','dy'])if(typeof payload[key]!=='number'||!Number.isFinite(payload[key]))throw new UIError('EVENT','拖拽坐标需要有限数字');
    if(payload.x<0||payload.x>next.scene.width||payload.y<0||payload.y>next.scene.height||Math.abs(payload.dx)>next.scene.width||Math.abs(payload.dy)>next.scene.height)throw new UIError('EVENT','拖拽坐标超出场景范围');
    if(!next.scene.marks.some(mark=>mark.id===payload.id&&mark.interactive))throw new UIError('EVENT','拖拽目标需要可交互图形');
  }
  const recordNext = event==='reset' ? initialScene(next.scene) : structuredClone(next.record);
  for(const name of preservedFields??[]){
    if(!Object.hasOwn(next.scene.initial,name))throw new UIError('SCENE_FIELD','重新开始只能保留已声明的参数');
    recordNext.values[name]=structuredClone(next.record.values[name]);
  }
  const input={...payload,dt:Math.max(0,Math.min(.1,payload.dt??0))};
  const random=()=>{ recordNext.seed=(Math.imul(recordNext.seed,1664525)+1013904223)>>>0;return recordNext.seed/4294967296; };
  for (const step of next.scene.events[event]??[]) {
    if (!Object.hasOwn(next.scene.initial,step.name)||badKey(step.name)) throw new UIError('SCENE_FIELD','场景事件只能改变已声明变量');
    recordNext.values[step.name]=evaluateFormula(step.value,{state:recordNext.values,locals:{event:input},random},b);
  }
  assertJSON(recordNext,SCENE_LIMITS); charge(b); return recordNext;
}
export function sceneSet(scene, record, field, value) {
  const next=currentScene(scene,record); if(!Object.hasOwn(next.scene.initial,field)||badKey(field))throw new UIError('SCENE_FIELD','无效场景参数');
  assertJSON(value,SCENE_LIMITS); return assertJSON({...next.record,values:{...next.record.values,[field]:value}},SCENE_LIMITS);
}
