import { initialScene } from './scene.mjs';
import { assertJSON, validName } from './limits.mjs';
export function collectDefaults(tree) {
  const result=Object.create(null);
  const set=(name,value)=>{if(validName(name)&&value!==undefined&&!Object.hasOwn(result,name))result[name]=value;};
  const visited=new Set();
  const walk=value=>{
    if (!value||typeof value!=='object'||visited.has(value))return;visited.add(value);
    if(value.name&&value.props){
      const p=value.props;
      if(p.bind){
        if(p.scene)set(p.bind,initialScene(p.scene));
        else if(value.name==='Checklist')set(p.bind,[]);
        else if(value.name==='Tabs')set(p.bind,p.value??(typeof p.tabs[0]==='string'?p.tabs[0]:p.tabs[0]?.value));
        else if(value.name==='Chart')set(p.bind,{hidden:[],selected:null});
        else if(value.name==='Table')set(p.bind,{sort:null,direction:'asc',selected:null});
        else set(p.bind,p.value??null);
      }
      if(!p.scene)for(const f of p.fields??[]){
        if(f.type==='select'){
          const option=f.options?.find(item=>!item||typeof item!=='object'||!item.disabled);
          set(f.name,f.value!==undefined?f.value:option&&typeof option==='object'?option.value:option??null);
        }else set(f.name,f.value??(f.type==='checkbox'?false:f.type==='text'||f.type==='textarea'?'':0));
      }
    }
    if(Array.isArray(value))value.forEach(walk);else Object.values(value).forEach(walk);
  };
  walk(tree);return assertJSON(result);
}
