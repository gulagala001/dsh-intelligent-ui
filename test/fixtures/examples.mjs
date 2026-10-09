import { examples } from '../../src/catalog.mjs';

export { examples };
export const exampleCases = examples.map((source, index) => ({
  id: ['checklist', 'budget', 'split-bill', 'savings', 'travel-form', 'comparison', 'photosynthesis', 'motion', 'target-game', 'nature', 'barbecue-counter', 'paper-bill'][index],
  source,
}));
export const mixedResponse = `先给你一个可操作的分账工具。\n\n\`\`\`openui\n${examples[2]}\n\`\`\`\n\n你可以继续调整人数或服务费。\n\n\`\`\`intelligent-ui\n${examples[0]}\n\`\`\``;

// These independent scenes exercise formula-driven arrays and multiple state fields,
// so the general interaction path is tested beyond the introductory examples.
export const coinSimulation = {
  initial: { trials: 0, heads: 0, probability: 0.5 }, seed: 39,
  events: {
    click: [{ name: 'heads', value: 'heads + (rand() < probability ? 1 : 0)' }, { name: 'trials', value: 'trials + 1' }],
    tick: [{ name: 'heads', value: 'heads + (rand() < probability ? 1 : 0)' }, { name: 'trials', value: 'trials + 1' }],
  },
  marks: [
    { id: 'headbar', type: 'rect', x: 80, y: { expr: '260 - (trials > 0 ? heads / trials * 200 : 0)' }, width: 100, height: { expr: 'trials > 0 ? heads / trials * 200 : 0' }, fill: 'blue', label: '正面频率' },
    { id: 'tailbar', type: 'rect', x: 260, y: { expr: '260 - (trials > 0 ? (trials - heads) / trials * 200 : 0)' }, width: 100, height: { expr: 'trials > 0 ? (trials - heads) / trials * 200 : 0' }, fill: 'orange', label: '反面频率' },
    { id: 'headslabel', type: 'text', x: 80, y: 290, text: { expr: 'concat("正面 ", heads)' }, fill: 'gray' },
    { id: 'tailslabel', type: 'text', x: 260, y: 290, text: { expr: 'concat("反面 ", trials - heads)' }, fill: 'gray' },
  ], width: 460, height: 320,
};
export const gridGame = {
  initial: { board: [0, 0, 0, 0, 0, 0, 0, 0, 0], moves: 0, selected: -1 }, seed: 1,
  events: {
    click: [
      { name: 'selected', value: 'event.id == "c0" ? 0 : event.id == "c1" ? 1 : event.id == "c2" ? 2 : event.id == "c3" ? 3 : event.id == "c4" ? 4 : event.id == "c5" ? 5 : event.id == "c6" ? 6 : event.id == "c7" ? 7 : event.id == "c8" ? 8 : -1' },
      { name: 'board', value: 'each(board, cell, index == selected ? mod(cell + 1, 3) : cell)' },
      { name: 'moves', value: 'selected >= 0 ? moves + 1 : moves' },
    ],
    key: [
      { name: 'selected', value: 'event.key == "ArrowRight" ? mod(selected + 1, 9) : event.key == "ArrowLeft" ? mod(selected - 1, 9) : selected' },
      { name: 'board', value: 'event.key == "Enter" ? each(board, cell, index == selected ? mod(cell + 1, 3) : cell) : board' },
      { name: 'moves', value: 'event.key == "Enter" && selected >= 0 ? moves + 1 : moves' },
    ],
  },
  marks: Array.from({ length: 9 }, (_, index) => ({
    id: `c${index}`, type: 'rect', x: 70 + index % 3 * 86, y: 20 + Math.floor(index / 3) * 86, width: 78, height: 78,
    fill: { expr: `board[${index}] == 0 ? "gray" : board[${index}] == 1 ? "blue" : "orange"` },
    stroke: { expr: `selected == ${index} ? "white" : "none"` }, strokeWidth: 3,
    label: `第 ${index + 1} 格，切换颜色`, interactive: true,
  })), width: 400, height: 290,
};
export const extendedExamples = [
  `root = Simulation(${JSON.stringify(coinSimulation)},"coinSimulation","概率实验",[{name:"probability",label:"正面概率",type:"slider",value:0.5,min:0,max:1,step:0.05}],[{label:"试验次数",formula:"trials",precision:0},{label:"正面频率",formula:"trials > 0 ? heads / trials * 100 : 0",unit:"%",precision:1}])`,
  `root = Game(${JSON.stringify(gridGame)},"colorGrid","颜色棋盘","点击格子切换三种颜色；也可用左右方向键选择，Enter 切换。")`,
];

// Isolated browser fixture; uses the production compiler/scene runtime and React 18.
// The host/API/persistence integration is exercised separately by native host tests.
export const componentHarness = `
import React,{useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {catalog,examples} from './src/catalog.mjs';
import {extendedExamples} from './test/fixtures/examples.mjs';
import {compile,evaluateDocument,safeEvaluate} from './src/runtime/evaluate.mjs';
import {collectDefaults} from './src/runtime/defaults.mjs';
import {sceneView,sceneTransition,sceneSet} from './src/runtime/scene.mjs';
import {renderComponent} from './src/client/components/index.jsx';
const sources=[...examples,...extendedExamples];
const index=Number(new URL(location.href).searchParams.get('example')||0),source=sources[index];
function App(){
 const document=useMemo(()=>compile(source),[]);
 const defaults=useMemo(()=>({...document.defaults,...collectDefaults(evaluateDocument(document))}),[]);
 const [state,update]=useState(()=>({...defaults,...JSON.parse(localStorage.getItem('state:'+index)||'{}')}));
 const [streaming,setStreaming]=useState(false),current=useRef(state);current.current=state;
 const set=(name,value)=>{
  if(streaming)return;
  if(window.fixture.failName===name)throw Error('注入更新故障');
  const next={...current.current,[name]:value};current.current=next;
  localStorage.setItem('state:'+index,JSON.stringify(next));update(next);
 };
 const action=value=>{
  if(streaming)return;
  for(const action of Array.isArray(value)?value:[value]){
   window.fixture.actions.push(action);
   if(action.type==='scene')set(action.name,sceneTransition(action.scene,current.current[action.name],action.event,action.payload));
   else if(action.type==='sceneSet')set(action.name,sceneSet(action.scene,current.current[action.name],action.field,action.value));
   else if(action.type==='reset')set(action.name,defaults[action.name]);
   else if(action.type==='set')set(action.name,action.value);
   else window.fixture.submits.push(action);
  }
 };
 const api={state,streaming,disabled:streaming,set,reset:name=>set(name,defaults[name]),action,
  evaluate:(formula,locals)=>safeEvaluate(formula,state,locals),sceneView:(scene,bind)=>sceneView(scene,state[bind])};
 const render=node=>Array.isArray(node)?node.map((value,index)=><React.Fragment key={value?.path||index}>{render(value)}</React.Fragment>):node&&typeof node==='object'&&node.name?renderComponent(node.name,node.props,render(node.props[catalog[node.name]?.children]||[]),api):node;
 window.fixture={...(window.fixture||{submits:[],actions:[],failName:null}),state,setStreaming};
 return <div className='iui-surface' data-theme={new URL(location.href).searchParams.get('theme')||'light'}>{render(evaluateDocument(document,state))}</div>;
}
window.root=createRoot(document.getElementById('root'));window.root.render(<App/>);
`;
