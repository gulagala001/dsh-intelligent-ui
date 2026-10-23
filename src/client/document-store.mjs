import { compile, evaluateDocument, safeEvaluate } from '../runtime/evaluate.mjs';
import { sceneView, sceneTransition, sceneSet, sceneRestart } from '../runtime/scene.mjs';
import { collectDefaults } from '../runtime/defaults.mjs';
import { assertJSON, UIError, validName, LIMITS } from '../runtime/limits.mjs';
import { ScenePlayback } from './scene-playback.mjs';
import { identityDigest } from '../runtime/identity.mjs';
import { reconcileTableSelections } from '../runtime/table-selection.mjs';
import { protocolVersion, componentsVersion, readableComponentsVersions } from '../protocol/version.mjs';

export async function sourceHash(source) { const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join(''); }
const base = 'intelligent-ui/api/state';
const widgetPrefix='@iui-widget:';
const widgetKeys=new Map();
const widgetPath=path=>typeof path==='string'&&path.length<=LIMITS.source&&/^root(?:$|[.\[])/.test(path)&&!/[\u0000-\u001f\u007f]/.test(path);
const widgetKey=path=>{if(!widgetPath(path))throw new UIError('PATH','无效组件路径');let key=widgetKeys.get(path);if(!key){key=widgetPrefix+identityDigest(path);if(widgetKeys.size>=1024)widgetKeys.delete(widgetKeys.keys().next().value);widgetKeys.set(path,key);}return key;};
const journalName=name=>validName(name)||typeof name==='string'&&/^@iui-widget:[a-f0-9]{64}$/.test(name);
function matchingJournal(draft,source){
  if(draft?.source!==source)return false;
  if(!draft.state||typeof draft.state!=='object'||Array.isArray(draft.state)||!Array.isArray(draft.dirty)||draft.dirty.some(name=>!journalName(name)||!Object.hasOwn(draft.state,name)))throw new UIError('JOURNAL','本地草稿格式无效');
  assertJSON(draft.state);return true;
}
function sameJSONValue(left,right) {
  if(left===right)return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
  const keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&sameJSONValue(left[key],right[key]));
}
function validRecord(record,session,block,projected=false) {
  if(!record||typeof record!=='object'||Array.isArray(record)||Object.hasOwn(record,'error')
    ||record.protocolVersion!==protocolVersion||!readableComponentsVersions.includes(record.componentsVersion??1)
    ||!Number.isSafeInteger(record.revision)||record.revision<(projected?0:1)
    ||typeof record.source!=='string'||record.source.length>LIMITS.source||typeof record.sourceRevision!=='string'||!/^[a-f0-9]{64}$/.test(record.sourceRevision)
    ||!record.state||typeof record.state!=='object'||Array.isArray(record.state)||projected&&Object.keys(record.state).length!==0
    ||record.persisted!==undefined&&typeof record.persisted!=='boolean'
    ||record.revision===0&&record.persisted===true||!projected&&record.persisted===false
    ||(!projected||record.session!==undefined)&&record.session!==session
    ||(!projected||record.block!==undefined)&&record.block!==block)return false;
  try { assertJSON(record.state);return true; } catch { return false; }
}
async function request(session,block,input,signal) {
  const response=await fetch(`${base}?session=${encodeURIComponent(session)}&block=${encodeURIComponent(block)}`,input===undefined?{signal}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
  let record;
  try { record=await response.json(); }
  catch(error) {
    if(error.name==='AbortError')throw error;
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(response.ok)throw Object.assign(new Error('设置服务返回了无效 JSON，请重试并检查插件是否正常启动。'),{status:response.status,cause:error});
  }
  if(!response.ok) {
    // A conflict is authoritative only for this persisted document. Invalid
    // or partial records must use the existing reload-before-save recovery.
    let conflict;
    if(response.status===409&&validRecord(record?.record,session,block)
      &&await sourceHash(record.record.source)===record.record.sourceRevision)conflict=record.record;
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const fallback=response.status===401?'登录已过期，请重新登录后重试。'
      :response.status===403?'没有读取或保存设置的权限，请检查当前会话。'
      :response.status===404?'设置服务尚未就绪，请稍后重试；若持续失败，请检查插件是否成功启动。'
      :response.status===409?'设置已在另一处更改，请重新读取后确认保存。'
      :'设置服务请求失败（HTTP '+response.status+'），请重试并检查插件日志。';
    throw Object.assign(new Error(typeof record?.error==='string'&&record.error.trim()?record.error:fallback),{status:response.status,record:conflict});
  }
  const invalid=()=>Object.assign(new Error('设置服务返回了无效记录；你的草稿仍保留，请重新读取后重试。'),{status:response.status});
  if(!record||typeof record!=='object'||Array.isArray(record))throw invalid();
  // A current-source projection is not persisted and can carry the previous
  // source's revision for CAS. The service deliberately omits its identity.
  const projected=input===undefined&&(record.revision===0||record.persisted===false);
  if(!validRecord(record,session,block,projected))throw invalid();
  if(input===undefined) {
    if(await sourceHash(record.source)!==record.sourceRevision)throw invalid();
  } else if(record.persisted===false||record.source!==input.source||record.sourceRevision!==input.sourceRevision
    ||record.revision<=input.expectedRevision||!sameJSONValue(record.state,JSON.parse(JSON.stringify(input.state))))throw invalid();
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  return projected?{...record,persisted:false}:record;
}
export class DocumentStore {
  constructor(sessionId,blockId,{ read=request, hash=sourceHash }={}) {
    this.sessionId=sessionId;this.blockId=blockId;this.request=read;this.hash=hash;this.listeners=new Set();this.state={};this.defaults={};this.dirty=new Set();this.revision=0;this.conflictRecord=null;this.sourceRevision=null;this.generation=0;this.disposed=false;this.journalError='';this.lastError='';
    this.snapshot={source:'',streaming:true,tree:null,state:this.state,status:'loading',error:'',componentsVersion};
    this.playback=new ScenePlayback();this.unbackedDrafts=new Map();
  }
  subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};
  getSnapshot=()=>this.snapshot;
  publish(extra={}) {if(Object.hasOwn(extra,'error'))this.lastError=extra.error;this.snapshot={...this.snapshot,state:this.state,...extra,previousDraft:this.previousDraft??null,error:[this.lastError,this.journalError,this.previousDraft?'上一版未保存的设置暂存在本页，可导出旧草稿。':''].filter(Boolean).join('\n')};for(const listener of this.listeners)listener(); }
  update(source,streaming,{reload=false,initialRecord}={}) {
    if(this.disposed||!reload&&this.snapshot.source===source&&this.snapshot.streaming===streaming)return;
    // A fetched record can seed only a fresh store, never replace live edits
    // or replay an old Pane response after this store changes generation.
    if(this.generation!==0)initialRecord=undefined;
    const changedSource=this.snapshot.source!==source;
    const incomingDraft=changedSource?(this.unbackedDrafts.get(source)??(this.previousDraft?.source===source?this.previousDraft:null)):null;
    const knownVersion=incomingDraft?.componentsVersion??(changedSource?componentsVersion:this.snapshot.componentsVersion??componentsVersion);
    this.playback.reset();const ticket=++this.generation;this.controller?.abort();clearTimeout(this.timer);this.sourceRevision=null;
    this.writing?.controller.abort();this.writing=null;this.reloadBeforeSave=false;
    if(changedSource){
      // A cancel may legally finish the old gesture before its API retires.
      // Keep that draft under its old source, never merge it into the new one.
      if(this.dirty.size){
        const draft={source:this.snapshot.source,state:structuredClone(this.state),dirty:[...this.dirty],revision:this.revision,conflict:Boolean(this.conflictRecord),componentsVersion:this.snapshot.componentsVersion??1};
        this.previousDraftPersisted=this.writeJournal();this.previousDraft=draft;
        if(this.previousDraftPersisted)this.unbackedDrafts.delete(draft.source);else this.unbackedDrafts.set(draft.source,draft);
      }
      this.journalError='';
      this.incomingDraft=incomingDraft;this.state=incomingDraft?structuredClone(incomingDraft.state):{};this.defaults={};this.dirty=new Set(incomingDraft?.dirty??[]);this.revision=incomingDraft?.revision??0;this.conflictRecord=null;
    }
    try {
      this.document=compile(source,{streaming});
      let tree=evaluateDocument(this.document,this.state);
      this.defaults={...this.document.defaults,...collectDefaults(tree)};
      const previous={...this.document.defaults,...this.state};
      this.state=assertJSON({...this.defaults,...this.state});
      if(Object.keys(this.state).some(name=>!Object.hasOwn(previous,name)||!Object.is(this.state[name],previous[name])))tree=evaluateDocument(this.document,this.state);
      this.publish({source,streaming,tree,error:'',componentsVersion:knownVersion,status:streaming?'streaming':'loading'});
    } catch(error) { this.document=null;this.publish({source,streaming,tree:null,componentsVersion:knownVersion,status:streaming?'streaming':'invalid',error:streaming?'':error.message}); }
    if(!streaming&&this.document) {
      this.controller=new AbortController();
      void this.hydrate(source,ticket,this.controller.signal,initialRecord);
    }
  }
  async hydrate(source,ticket,signal,initialRecord) {
    try {
      let record=initialRecord===undefined?undefined:structuredClone(initialRecord);
      const hash=await this.hash(source);
      if(initialRecord!==undefined&&(record?.session!==this.sessionId||record.block!==this.blockId||record.source!==source||!readableComponentsVersions.includes(record.componentsVersion)
        ||!validRecord(record,this.sessionId,this.blockId,record.revision===0||record.persisted===false)))throw new UIError('RECORD','作品初始设置无效，请重试读取');
      if(initialRecord!==undefined&&record.revision===0)record.persisted=false;
      if(initialRecord===undefined)for(let attempt=0;attempt<8;attempt++){
        try{record=await this.request(this.sessionId,this.blockId,undefined,signal);break;}
        catch(error){if(error.status!==404||attempt===7)throw error;await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,150*(attempt+1));signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});}
      }
      if(this.disposed||ticket!==this.generation||this.snapshot.source!==source||this.snapshot.streaming)return;
      if(record.sourceRevision!==hash)throw new UIError('SOURCE','作品内容已变化，请重新打开');
      assertJSON(record.state);const draft=this.restoreJournal(source);this.revision=record.revision;this.sourceRevision=hash;
      const next=this.mergeState(record.state);
      let tree;
      try { tree=evaluateDocument(this.document,next); }
      catch(error) {
        if(!this.dirty.size)throw error;
        // An incompatible remote merge must not make a recoverable draft
        // uneditable after reopening. Its full snapshot retains a usable view.
        const local=draft?this.mergeState(draft.state):this.state;
        const localTree=evaluateDocument(this.document,local);
        this.state=local;this.conflictRecord=record;
        this.publish({tree:localTree,componentsVersion:record.componentsVersion??1,status:'conflict',error:'设置未能合并，请调整后确认保存：'+error.message});
        this.writeJournal();return;
      }
      this.state=next;
      if(draft){for(const name of this.dirty)if(record.persisted!==false&&sameJSONValue(Object.hasOwn(record.state,name)?record.state[name]:this.defaults[name],this.state[name]))this.dirty.delete(name);if(this.dirty.size&&(draft.revision!==record.revision||draft.conflict))this.conflictRecord=record;}
      this.publish({tree,componentsVersion:record.componentsVersion??1,status:this.conflictRecord?'conflict':this.dirty.size?'unsaved':record.persisted===false?'default':'saved',error:this.conflictRecord?'其他地方已修改设置。你的草稿已恢复，确认后可以合并保存。':''});
      if(this.dirty.size&&!this.conflictRecord)this.scheduleSave();
    }catch(error){if(error.name!=='AbortError'&&!this.disposed&&ticket===this.generation)this.publish({status:'load-error',error:'设置读取失败：'+error.message});}
  }
  set(name,value) {
    if(!validName(name))throw new UIError('NAME','无效变量');
    return this.setValue(name.replace(/^\$/,''),value);
  }
  widget(path,initial){const key=widgetKey(path);return Object.hasOwn(this.state,key)?this.state[key]:initial;}
  setWidget(path,value){return this.setValue(widgetKey(path),value);}
  setValue(name,value) {
    if(this.snapshot.streaming||!this.document||this.disposed)throw new UIError('BUSY','等待内容完成后再操作');
    assertJSON(value);
    const changed=new Set([name]),checked=this.checkTableSelections({...this.state,[name]:value},changed,new Set([name]));
    this.state=checked.state;changed.forEach(key=>this.dirty.add(key));this.writeJournal();this.publish({tree:checked.tree,status:this.conflictRecord?'conflict':'unsaved',error:this.conflictRecord?this.snapshot.error:''});this.scheduleSave();
  }
  checkTableSelections(state,changed,explicitBindings) {
    for(let round=0;round<=LIMITS.stateKeys;round++){
      const tree=evaluateDocument(this.document,state);
      const result=reconcileTableSelections(tree,state,this.snapshot.tree,this.state,explicitBindings);
      if(!result.cleared.size)return{state,tree};
      state=result.state;result.cleared.forEach(name=>changed.add(name));
    }
    throw new UIError('ACTION','表格选择无法与当前数据保持一致');
  }
  reset(name){this.set(name,this.defaults[name]??null);}
  action(value,onSubmit) {
    if(this.snapshot.streaming||this.disposed)throw new UIError('BUSY','等待内容完成后再操作');
    const actions=Array.isArray(value)?value:[value];if(actions.length>30)throw new UIError('ACTION','动作过多');
    let next={...this.state};const changed=new Set(),explicitBindings=new Set();let submission;
    for(const action of actions){
      if(!action||typeof action!=='object')throw new UIError('ACTION','动作格式无效');
      if(action.type==='submit'){
        if(submission!==undefined||typeof action.text!=='string'||action.text.length>16000||action.fields&&!Array.isArray(action.fields))throw new UIError('ACTION','提交格式无效');
        next=this.checkTableSelections(next,changed,explicitBindings).state;
        const selected=Object.fromEntries((action.fields??[]).map(name=>{if(!validName(name))throw new UIError('NAME','无效字段');return [name,next[name]??null];}));assertJSON(selected);
        submission=action.text+(Object.keys(selected).length?'\n\n所选设置：\n'+JSON.stringify(selected,null,2):'');continue;
      }
      if(!validName(action.name))throw new UIError('NAME','无效变量');const name=action.name.replace(/^\$/,'');
      if(action.type==='set')next[name]=action.value;
      else if(action.type==='reset')next[name]=this.defaults[name]??null;
      else if(action.type==='scene')next[name]=sceneTransition(action.scene,next[name],action.event,action.payload);
      else if(action.type==='sceneRestart')next[name]=sceneRestart(action.scene,next[name],action.fields);
      else if(action.type==='sceneSet')next[name]=sceneSet(action.scene,next[name],action.field,action.value);
      else throw new UIError('ACTION','未知动作');
      changed.add(name);
      explicitBindings.add(name);
    }
    const checked=this.checkTableSelections(next,changed,explicitBindings);next=checked.state;const tree=checked.tree;
    if(changed.size){this.state=next;changed.forEach(name=>this.dirty.add(name));this.writeJournal();this.publish({tree,status:this.conflictRecord?'conflict':'unsaved',error:this.conflictRecord?this.snapshot.error:''});this.scheduleSave();}
    if(submission!==undefined){if(!onSubmit)throw new UIError('SUBMIT','当前作品不能继续对话');return onSubmit(submission);}
  }
  scheduleSave(){clearTimeout(this.timer);if(this.sourceRevision&&!this.conflictRecord&&!['conflict','load-error'].includes(this.snapshot.status))this.timer=setTimeout(()=>void this.save(),350);}
  mergeState(remote) {
    const next={...this.defaults,...remote};
    for(const name of this.dirty)next[name]=this.state[name];
    return next;
  }
  async save({resolveConflict=false}={}) {
    clearTimeout(this.timer);
    if(this.disposed||this.snapshot.streaming||!this.sourceRevision||!this.dirty.size||this.writing||this.conflictRecord&&!resolveConflict)return;
    const ticket=this.generation,source=this.snapshot.source,hash=this.sourceRevision;
    const writing={controller:new AbortController()};this.writing=writing;this.publish({status:'saving'});
    try{
      if(this.reloadBeforeSave){
        // Recovery owns the same write slot as the following POST. A second
        // retry cannot race its GET and overwrite a newer save receipt.
        const knownRevision=this.revision;
        const current=await this.request(this.sessionId,this.blockId,undefined,writing.controller.signal);
        if(this.disposed||ticket!==this.generation)return;
        if(current.sourceRevision!==hash)throw new UIError('SOURCE','作品内容已变化，请重新打开');
        assertJSON(current.state);this.reloadBeforeSave=false;
        this.revision=current.revision;
        if(current.persisted!==false&&current.revision!==knownRevision){
          this.conflictRecord=current;
          this.publish({status:'conflict',error:'另一处修改了设置。你的操作已保留，可确认后保存。'});return;
        }
        const next=this.mergeState(current.state);
        this.conflictRecord=current;
        const tree=evaluateDocument(this.document,next);
        this.state=next;this.conflictRecord=null;
        this.publish({tree,componentsVersion:current.componentsVersion??this.snapshot.componentsVersion});
      }
      const state=structuredClone(this.conflictRecord?this.mergeState(this.conflictRecord.state):this.state),names=new Set(this.dirty);
      // Local and remote edits can be valid separately but incompatible together.
      // Validate that combination before replacing the durable record.
      if(this.conflictRecord)evaluateDocument(this.document,state);
      const record=await this.request(this.sessionId,this.blockId,{session:this.sessionId,block:this.blockId,expectedRevision:this.revision,sourceRevision:hash,source,state},writing.controller.signal);
      if(this.disposed||ticket!==this.generation)return;
      this.revision=record.revision;this.conflictRecord=record;
      // A delayed receipt acknowledges only the exact values it wrote.
      for(const name of names)if(sameJSONValue(this.state[name],state[name]))this.dirty.delete(name);
      // The dirty set owns edit intent, including reselecting an unchanged value.
      // Keep the usable local state if later edits cannot merge with this receipt.
      const settled=this.mergeState(record.state??state),tree=evaluateDocument(this.document,settled);
      this.state=settled;this.conflictRecord=null;this.writeJournal();
      this.publish({tree,componentsVersion:record.componentsVersion??this.snapshot.componentsVersion,status:this.dirty.size?'unsaved':'saved',error:''});
    }catch(error){
      if(!this.disposed&&ticket===this.generation){
        if(error.status===409&&error.record&&error.record.sourceRevision===this.sourceRevision&&(error.record.source===undefined||error.record.source===this.snapshot.source)){
          this.revision=error.record.revision;this.conflictRecord=error.record;
          this.publish({status:'conflict',error:'另一处修改了设置。你的操作已保留，可确认后保存。'});
        }else{
          if(error.status===409){this.conflictRecord=null;this.reloadBeforeSave=true;}
          this.publish({status:this.conflictRecord?'conflict':'save-error',error:'设置尚未保存：'+error.message});
        }
        this.writeJournal();
      }
    }
    finally{if(this.writing===writing){this.writing=null;if(this.dirty.size&&this.snapshot.status==='unsaved')this.scheduleSave();}}
  }
  api(onSubmit) {
    const generation=this.generation;
    const current=run=>{if(this.disposed||generation!==this.generation)throw new UIError('SOURCE','作品内容已变化，请等待当前内容完成后再操作');return run();};
    return {state:this.state,streaming:this.snapshot.streaming,disabled:this.snapshot.streaming||['loading','load-error'].includes(this.snapshot.status),blockId:this.blockId,playback:this.playback,playbackVersion:this.generation,set:(n,v)=>current(()=>this.set(n,v)),widget:(path,initial)=>this.widget(path,initial),setWidget:(path,value)=>current(()=>this.setWidget(path,value)),reset:n=>current(()=>this.reset(n)),action:a=>current(()=>this.action(a,onSubmit)),evaluate:(formula,locals={})=>safeEvaluate(formula,this.state,locals),sceneView:(scene,bind)=>sceneView(scene,this.state[bind])};
  }
  dispose(){if(this.disposed)return;this.writeJournal();this.playback.reset();clearTimeout(this.timer);this.controller?.abort();this.writing?.controller.abort();this.writing=null;this.disposed=true;this.listeners.clear();}
  journalKey(source){
    if(this.journalSource!==source){this.journalSource=source;this.sourceJournalKey='dsh-iui.draft.v1:'+this.sessionId+':'+this.blockId+':'+identityDigest(source);}
    return this.sourceJournalKey;
  }
  writeJournal(){
    try{const storage=globalThis.sessionStorage;if(!storage)return false;const source=this.snapshot.source,key=this.journalKey(source),legacyKey='dsh-iui.draft.v1:'+this.sessionId+':'+this.blockId;
      if(!this.dirty.size){
        // An unread backup is not acknowledged by a default-state view.
        // Only successful hydration of this source can authorize cleanup.
        if(!this.sourceRevision)return true;
        // Either key may contain a foreign or unreadable backup. Cleanup
        // retires only a recognizable draft owned by the current source.
        for(const backupKey of [key,legacyKey]){
          try{if(!matchingJournal(JSON.parse(storage.getItem(backupKey)),source))continue;}catch{continue;}
          storage.removeItem(backupKey);
        }
        this.journalError='';return true;
      }
      const value=JSON.stringify({source,state:this.state,dirty:[...this.dirty],revision:this.revision,conflict:Boolean(this.conflictRecord),componentsVersion:this.snapshot.componentsVersion??1});if(value.length>300000)throw new UIError('JOURNAL','本地草稿过大');storage.setItem(key,value);this.unbackedDrafts.delete(source);this.journalError='';return true;
    }catch{this.journalError='本地草稿暂时无法备份，请保持页面打开并重试保存。';if(!this.disposed)this.publish();return false;}
  }
  restoreJournal(source){
    try{
      const retained=this.incomingDraft?.source===source?this.incomingDraft:this.previousDraft?.source===source?this.previousDraft:null,storage=globalThis.sessionStorage;
      const raw=retained?null:storage?.getItem(this.journalKey(source))??storage?.getItem('dsh-iui.draft.v1:'+this.sessionId+':'+this.blockId);
      if(!retained&&!raw)return;
      const draft=retained??JSON.parse(raw);
      if(!matchingJournal(draft,source))return;
      // The journal may predate edits made while hashing or loading, especially
      // when quota failure prevented the latest in-memory draft being backed up.
      for(const name of draft.dirty){if(!this.dirty.has(name))this.state[name]=draft.state[name];this.dirty.add(name);}
      this.unbackedDrafts.delete(source);
      if(retained===this.previousDraft){this.previousDraft=null;this.previousDraftPersisted=false;}
      if(retained===this.incomingDraft)this.incomingDraft=null;
      return draft;
    }
    catch{this.journalError='本地草稿无法读取，已保留原始备份。';this.publish();}
  }
}

const stores=new Map();
export function acquireDocument(session,block) {
  const key=`${session}\0${block}`;let item=stores.get(key);
  if(!item){
    item={store:new DocumentStore(session,block),refs:0};stores.set(key,item);
    item.scheduleCleanup=()=>{
      if(item.refs||stores.get(key)!==item)return;
      clearTimeout(item.cleanup);
      item.cleanup=setTimeout(()=>{
        if(item.refs||stores.get(key)!==item||item.store.dirty.size||item.store.writing||item.store.conflictRecord||item.store.unbackedDrafts.size||item.store.previousDraft&&!item.store.previousDraftPersisted)return;
        item.unsubscribe();item.store.dispose();stores.delete(key);
      },30000);
    };
    item.unsubscribe=item.store.subscribe(item.scheduleCleanup);
  }
  clearTimeout(item.cleanup);item.refs++;
  let released=false;
  return {store:item.store,release(){if(released)return;released=true;if(--item.refs===0){void item.store.save();item.store.writeJournal();item.scheduleCleanup();}}};
}
export function disposeDocuments(){for(const item of stores.values()){clearTimeout(item.cleanup);item.unsubscribe();item.store.dispose();}stores.clear();}
