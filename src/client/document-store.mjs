import { compile, evaluateDocument, safeEvaluate } from '../runtime/evaluate.mjs';
import { sceneView, sceneTransition, sceneSet } from '../runtime/scene.mjs';
import { collectDefaults } from '../runtime/defaults.mjs';
import { assertJSON, UIError, validName } from '../runtime/limits.mjs';

export async function sourceHash(source) { const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join(''); }
const base = 'intelligent-ui/api/state';
async function request(session,block,input,signal) {
  const response=await fetch(`${base}?session=${encodeURIComponent(session)}&block=${encodeURIComponent(block)}`,input===undefined?{signal}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
  const record=await response.json();if(!response.ok)throw Object.assign(new Error(record.error??'保存失败'),{status:response.status,record:record.record});return record;
}
export class DocumentStore {
  constructor(sessionId,blockId,{ read=request, hash=sourceHash }={}) {
    this.sessionId=sessionId;this.blockId=blockId;this.request=read;this.hash=hash;this.listeners=new Set();this.state={};this.defaults={};this.dirty=new Set();this.revision=0;this.conflictRecord=null;this.sourceRevision=null;this.generation=0;this.disposed=false;this.journalError='';this.lastError='';
    this.snapshot={source:'',streaming:true,tree:null,state:this.state,status:'loading',error:''};
  }
  subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  getSnapshot=()=>this.snapshot;
  publish(extra={}) {if(Object.hasOwn(extra,'error'))this.lastError=extra.error;this.snapshot={...this.snapshot,state:this.state,...extra,error:[this.lastError,this.journalError].filter(Boolean).join('\n')};for(const listener of this.listeners)listener(); }
  update(source,streaming) {
    if(this.disposed||this.snapshot.source===source&&this.snapshot.streaming===streaming)return;
    const ticket=++this.generation;this.controller?.abort();clearTimeout(this.timer);this.sourceRevision=null;
    const wasFinal=!this.snapshot.streaming;
    try {
      this.document=compile(source,{streaming});
      let tree=evaluateDocument(this.document,this.state);
      this.defaults={...this.document.defaults,...collectDefaults(tree)};
      this.state={...this.defaults,...this.state};tree=evaluateDocument(this.document,this.state);
      this.publish({source,streaming,tree,error:'',status:streaming?'streaming':this.sourceRevision&&wasFinal?'saved':'loading'});
    } catch(error) { this.document=null;this.publish({source,streaming,tree:null,status:streaming?'streaming':'invalid',error:streaming?'':error.message}); }
    if(!streaming&&this.document) {
      this.controller=new AbortController();
      void this.hydrate(source,ticket,this.controller.signal);
    }
  }
  async hydrate(source,ticket,signal) {
    try {
      const hash=await this.hash(source);let record;
      for(let attempt=0;attempt<8;attempt++){
        try{record=await this.request(this.sessionId,this.blockId,undefined,signal);break;}
        catch(error){if(error.status!==404||attempt===7)throw error;await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,150*(attempt+1));signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});}
      }
      if(this.disposed||ticket!==this.generation||this.snapshot.source!==source||this.snapshot.streaming)return;
      if(record.sourceRevision!==hash)throw new UIError('SOURCE','作品内容已变化，请重新打开');
      assertJSON(record.state);const draft=this.restoreJournal(source);this.revision=record.revision;this.sourceRevision=hash;
      const next={...this.defaults,...record.state};for(const name of this.dirty)next[name]=this.state[name];this.state=next;
      if(draft){for(const name of this.dirty)if(JSON.stringify(record.state[name]??this.defaults[name])===JSON.stringify(this.state[name]))this.dirty.delete(name);if(this.dirty.size&&(draft.revision!==record.revision||draft.conflict))this.conflictRecord=record;}
      this.publish({tree:evaluateDocument(this.document,this.state),status:this.conflictRecord?'conflict':this.dirty.size?'unsaved':'saved',error:this.conflictRecord?'其他地方已修改设置。你的草稿已恢复，确认后可以合并保存。':''});
      if(this.dirty.size&&!this.conflictRecord)this.scheduleSave();
    }catch(error){if(error.name!=='AbortError'&&!this.disposed&&ticket===this.generation)this.publish({status:'load-error',error:'设置读取失败：'+error.message});}
  }
  set(name,value) {
    if(this.snapshot.streaming||!this.document||this.disposed)throw new UIError('BUSY','等待内容完成后再操作');
    if(!validName(name))throw new UIError('NAME','无效变量');name=name.replace(/^\$/,'');assertJSON(value);
    const next=assertJSON({...this.state,[name]:value}),tree=evaluateDocument(this.document,next);
    this.state=next;this.dirty.add(name);this.writeJournal();this.publish({tree,status:this.conflictRecord?'conflict':'unsaved',error:this.conflictRecord?this.snapshot.error:''});this.scheduleSave();
  }
  reset(name){this.set(name,this.defaults[name]??null);}
  action(value,onSubmit) {
    if(this.snapshot.streaming||this.disposed)throw new UIError('BUSY','等待内容完成后再操作');
    const actions=Array.isArray(value)?value:[value];if(actions.length>30)throw new UIError('ACTION','动作过多');
    let next={...this.state};const changed=new Set();let submission;
    for(const action of actions){
      if(!action||typeof action!=='object')throw new UIError('ACTION','动作格式无效');
      if(action.type==='submit'){
        if(submission||typeof action.text!=='string'||action.text.length>16000||action.fields&&!Array.isArray(action.fields))throw new UIError('ACTION','提交格式无效');
        const selected=Object.fromEntries((action.fields??[]).map(name=>{if(!validName(name))throw new UIError('NAME','无效字段');return [name,next[name]??null];}));assertJSON(selected);
        submission=action.text+(Object.keys(selected).length?'\n\n所选设置：\n'+JSON.stringify(selected,null,2):'');continue;
      }
      if(!validName(action.name))throw new UIError('NAME','无效变量');const name=action.name.replace(/^\$/,'');
      if(action.type==='set')next[name]=action.value;
      else if(action.type==='reset')next[name]=this.defaults[name]??null;
      else if(action.type==='scene')next[name]=sceneTransition(action.scene,next[name],action.event,action.payload);
      else if(action.type==='sceneSet')next[name]=sceneSet(action.scene,next[name],action.field,action.value);
      else throw new UIError('ACTION','未知动作');
      changed.add(name);
    }
    assertJSON(next);const tree=evaluateDocument(this.document,next);
    if(changed.size){this.state=next;changed.forEach(name=>this.dirty.add(name));this.writeJournal();this.publish({tree,status:this.conflictRecord?'conflict':'unsaved',error:this.conflictRecord?this.snapshot.error:''});this.scheduleSave();}
    if(submission){if(!onSubmit)throw new UIError('SUBMIT','当前作品不能继续对话');return onSubmit(submission);}
  }
  scheduleSave(){clearTimeout(this.timer);if(this.sourceRevision&&!this.conflictRecord&&!['conflict','load-error'].includes(this.snapshot.status))this.timer=setTimeout(()=>void this.save(),350);}
  async save({resolveConflict=false}={}) {
    clearTimeout(this.timer);
    if(this.disposed||this.snapshot.streaming||!this.sourceRevision||!this.dirty.size||this.writing||this.conflictRecord&&!resolveConflict)return;
    const beforeState=structuredClone(this.state),state=structuredClone(this.conflictRecord?{...this.defaults,...this.conflictRecord.state,...Object.fromEntries([...this.dirty].map(name=>[name,this.state[name]]))}:this.state),names=new Set(this.dirty),ticket=this.generation;this.writing=true;this.publish({status:'saving'});
    try{
      const record=await this.request(this.sessionId,this.blockId,{session:this.sessionId,block:this.blockId,expectedRevision:this.revision,sourceRevision:this.sourceRevision,source:this.snapshot.source,state});
      if(this.disposed||ticket!==this.generation)return;
      this.revision=record.revision;this.conflictRecord=null;
      // A delayed receipt acknowledges only the exact values it wrote.
      for(const name of names)if(JSON.stringify(this.state[name])===JSON.stringify(state[name]))this.dirty.delete(name);
      const settled={...this.defaults,...(record.state??state)};for(const name of Object.keys(this.state))if(JSON.stringify(this.state[name])!==JSON.stringify(beforeState[name]))settled[name]=this.state[name];this.state=settled;this.writeJournal();
      this.publish({tree:evaluateDocument(this.document,this.state),status:this.dirty.size?'unsaved':'saved',error:''});
    }catch(error){if(!this.disposed&&ticket===this.generation){if(error.status===409&&error.record){this.revision=error.record.revision;this.conflictRecord=error.record;this.publish({status:'conflict',error:'另一处修改了设置。你的操作已保留，可确认后保存。'});}else this.publish({status:'save-error',error:'设置尚未保存：'+error.message});}}
    finally{this.writing=false;if(this.dirty.size&&this.snapshot.status==='unsaved')this.scheduleSave();}
  }
  api(onSubmit) { return {state:this.state,streaming:this.snapshot.streaming,disabled:this.snapshot.streaming||['loading','load-error'].includes(this.snapshot.status),blockId:this.blockId,set:(n,v)=>this.set(n,v),reset:n=>this.reset(n),action:a=>this.action(a,onSubmit),evaluate:(formula,locals={})=>safeEvaluate(formula,this.state,locals),sceneView:(scene,bind)=>sceneView(scene,this.state[bind])}; }
  dispose(){if(this.disposed)return;this.writeJournal();clearTimeout(this.timer);this.controller?.abort();this.disposed=true;this.listeners.clear();}
  writeJournal(){
    try{const storage=globalThis.sessionStorage;if(!storage)return;const key='dsh-iui.draft.v1:'+this.sessionId+':'+this.blockId;
      if(!this.dirty.size){storage.removeItem(key);this.journalError='';return;}
      const value=JSON.stringify({source:this.snapshot.source,state:this.state,dirty:[...this.dirty],revision:this.revision,conflict:Boolean(this.conflictRecord)});if(value.length>300000)throw new UIError('JOURNAL','本地草稿过大');storage.setItem(key,value);this.journalError='';
    }catch{this.journalError='本地草稿暂时无法备份，请保持页面打开并重试保存。';if(!this.disposed)this.publish();}
  }
  restoreJournal(source){
    try{const raw=globalThis.sessionStorage?.getItem('dsh-iui.draft.v1:'+this.sessionId+':'+this.blockId);if(!raw)return;const draft=JSON.parse(raw);if(draft.source!==source)return;assertJSON(draft.state);if(!Array.isArray(draft.dirty)||draft.dirty.some(name=>!validName(name)))return;for(const name of draft.dirty){this.state[name]=draft.state[name];this.dirty.add(name);}return draft;}
    catch{this.journalError='本地草稿无法读取，已保留原始备份。';this.publish();}
  }
}

const stores=new Map();
export function acquireDocument(session,block) {
  const key=`${session}\0${block}`;let item=stores.get(key);
  if(!item){item={store:new DocumentStore(session,block),refs:0};stores.set(key,item);}
  clearTimeout(item.cleanup);item.refs++;
  return {store:item.store,release(){if(--item.refs===0){void item.store.save();item.store.writeJournal();item.cleanup=setTimeout(()=>{if(item.store.dirty.size||item.store.writing||item.store.conflictRecord)return;item.store.dispose();stores.delete(key);},30000);}}};
}
export function disposeDocuments(){for(const item of stores.values()){clearTimeout(item.cleanup);item.store.dispose();}stores.clear();}
