import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {renderComponent} from './components/index.jsx';
import {catalog} from '../catalog.mjs';
import {isTrustedElement} from '../runtime/evaluate.mjs';
import {acquireDocument} from './document-store.mjs';
import {protocolVersion,componentsVersion} from '../protocol/version.mjs';

class Boundary extends React.Component {
  state={error:null};static getDerivedStateFromError(error){return{error};}
  componentDidUpdate(previous){if(previous.source!==this.props.source&&this.state.error)this.setState({error:null});}
  render(){return this.state.error?<p role="alert" className="iui-error">内容暂时无法显示：{this.state.error.message}</p>:this.props.children;}
}
function Tree({node,api}) {
  if(node===null||node===undefined)return null;
  if(Array.isArray(node))return node.map((value,i)=><Tree key={value?.path??i} node={value} api={api}/>);
  if(!isTrustedElement(node))return <span role="alert">无效的交互组件</span>;
  if(node.name==='__pending')return <div className="iui-skeleton" aria-label="正在生成内容"/>;
  const def=catalog[node.name],children=def?.children?node.props[def.children]:[];
  const rendered=Array.isArray(children)?children.map((value,i)=><Tree key={value?.path??i} node={value} api={api}/>):<Tree node={children} api={api}/>;
  return renderComponent(node.name,node.props,rendered,{...api,componentPath:node.path});
}
function download(name,content,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function IntelligentSurface({source='',streaming=false,sessionId,blockId,onSubmit,onExpand,expanded=false}) {
  const lease=useMemo(()=>acquireDocument(sessionId,blockId),[sessionId,blockId]);const {store}=lease;
  useEffect(()=>()=>lease.release(),[lease]);
  useEffect(()=>store.update(source,streaming),[store,source,streaming]);
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot),[showSource,setShowSource]=useState(false),[notice,setNotice]=useState(''),[repairing,setRepairing]=useState(false);
  const repairPending=useRef(false),actionEpoch=useRef(0);
  useEffect(()=>{actionEpoch.current++;repairPending.current=false;setRepairing(false);setNotice('');return()=>{actionEpoch.current++;repairPending.current=false;};},[source,sessionId,blockId]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  const api=store.api(onSubmit);const states={loading:'读取设置…',streaming:'正在生成…',saving:'正在保存…',saved:'已保存',unsaved:'等待保存',conflict:'设置冲突','save-error':'尚未保存','load-error':'读取失败',invalid:'内容有误'};
  const copy=async()=>{const epoch=actionEpoch.current;try{await navigator.clipboard.writeText(source);if(epoch===actionEpoch.current)setNotice('已复制');}catch{if(epoch===actionEpoch.current)setNotice('复制失败，可展开源文复制');}};
  const repair=()=>{
    if(repairPending.current)return;repairPending.current=true;setRepairing(true);const epoch=actionEpoch.current;
    void Promise.resolve().then(()=>onSubmit(`这段交互内容无法显示：${snapshot.error.slice(0,1200)}。请读取所需组件与表达式说明，修复这段交互内容并保持原来的功能。`)).then(()=>{if(epoch===actionEpoch.current)setNotice('修复请求已发送');},error=>{if(epoch===actionEpoch.current)setNotice(error?.message||'修复请求未发送，请重试');}).finally(()=>{if(epoch===actionEpoch.current){repairPending.current=false;setRepairing(false);}});
  };
  return <div className="iui-surface" data-iui-block={blockId} aria-busy={streaming||snapshot.status==='loading'}>
    <Boundary source={source}><Tree node={snapshot.tree} api={api}/></Boundary>
    {!snapshot.tree&&!snapshot.error&&<div className="iui-skeleton" aria-label="正在生成交互内容"/>}
    {snapshot.error&&<p role="alert" className="iui-error">{snapshot.error}{snapshot.status==='invalid'&&onSubmit&&<button type="button" disabled={repairing} aria-busy={repairing} onClick={repair}>{repairing?'正在请求修复…':'修复'}</button>}{snapshot.status==='conflict'&&<button type="button" onClick={()=>void store.save({resolveConflict:true})}>保留当前设置并保存</button>}{snapshot.status==='save-error'&&<button type="button" onClick={()=>void store.save()}>重试保存</button>}{snapshot.status==='load-error'&&<button type="button" onClick={()=>store.update(source,streaming,{reload:true})}>重试读取</button>}</p>}
    <div className="iui-surface-toolbar"><span className="iui-surface-feedback"><span role="status">{states[snapshot.status]}</span>{notice&&<span role="status">{notice}</span>}</span>
      {snapshot.previousDraft&&<button type="button" onClick={()=>{try{download('intelligent-ui-previous-draft.json',JSON.stringify({protocolVersion,componentsVersion:snapshot.previousDraft.componentsVersion,source:snapshot.previousDraft.source,state:snapshot.previousDraft.state},null,2));setNotice('已导出上一版源文与设置');}catch{setNotice('草稿导出失败，请重试');}}}>导出旧草稿</button>}
      {onExpand&&!expanded&&<button type="button" title={streaming||snapshot.streaming?'生成完成后可展开':'展开'} aria-label="展开交互内容" disabled={streaming||snapshot.streaming} onClick={()=>onExpand({source,sessionId,blockId})}>↗</button>}
      <button type="button" title="复制源文" aria-label="复制交互源文" onClick={copy}>复制</button>
      <button type="button" title="导出完整源文与当前设置" onClick={()=>{try{download('intelligent-ui.json',JSON.stringify({protocolVersion,componentsVersion:snapshot.componentsVersion??componentsVersion,source,state:snapshot.state},null,2));setNotice('已导出源文与当前设置');}catch{setNotice('导出失败，请重试');}}}>导出</button>
      <button type="button" aria-expanded={showSource} onClick={()=>setShowSource(!showSource)}>源文</button>
    </div>
    {showSource&&<pre className="iui-source"><code>{source}</code></pre>}
  </div>;
}
