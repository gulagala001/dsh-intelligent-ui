import test from 'node:test';import assert from 'node:assert/strict';
import {examples} from '../src/catalog.mjs';
import {compile,evaluateDocument,safeEvaluate,safePublicURL} from '../src/runtime/evaluate.mjs';
import {splitResponse} from '../src/protocol/split.mjs';
import {collectDefaults} from '../src/runtime/defaults.mjs';
import {sceneTransition,sceneView,initialScene,sceneRestart} from '../src/runtime/scene.mjs';
test('mixed Markdown fences preserve source and ignore nested code, every streaming prefix terminates',()=>{
  const ui='root = Stack([Text("你好🌏")])\n';const raw='Before\n```openui\n'+ui+'```\nMiddle\n````md\n```openui\nignored\n```\n````\n~~~intelligent-ui\nroot = Text("ok")\n~~~\nAfter';
  const parts=splitResponse(raw);assert.deepEqual(parts.filter(x=>x.kind==='ui').map(x=>x.text),[ui,'root = Text("ok")\n']);assert.equal(parts.at(-1).text,'After');
  for(let i=0;i<=raw.length;i++){const p=splitResponse(raw.slice(0,i),{streaming:true});assert.ok(p.length<10);assert.ok(p.filter(x=>x.kind==='ui').every(x=>typeof x.complete==='boolean'));}
});
test('complete component examples compile and validate actual props',()=>{assert.ok(examples.length>=10);for(const source of examples){const d=compile(source),root=evaluateDocument(d);assert.ok(root.name);assert.doesNotThrow(()=>collectDefaults(root));}});
test('component paths distinguish object keys, logical arms and conditional branches',()=>{
  const doc=compile('items = {"a.b": Table(["值"],[[1]],"点"), a:{b:Table(["值"],[[2]],"嵌套")}, "中文/键":Table(["值"],[[3]],"中文")}\nroot = Stack([items["a.b"],items.a.b,items["中文/键"]])');
  const paths=evaluateDocument(doc).props.children.map(item=>item.path);assert.equal(new Set(paths).size,3);
  const branches=compile('$show = true\nroot = $show ? Table(["值"],[[1]],"A") : Table(["值"],[[2]],"B")');
  assert.notEqual(evaluateDocument(branches,{show:true}).path,evaluateDocument(branches,{show:false}).path);
  const logical=compile('$show = true\nroot = ($show && Table(["值"],[[1]],"A")) || Table(["值"],[[2]],"B")');
  assert.notEqual(evaluateDocument(logical,{show:true}).path,evaluateDocument(logical,{show:false}).path);
});
test('named call arguments identify the component and argument without accepting assignments',()=>{
  for(const source of ['root = Card([], title="趋势", description="数据")','root = Stack([Card([], title="趋势")])'])assert.throws(()=>compile(source),error=>error.code==='SYNTAX'&&/Card 第 2 个参数.*title=.*位置参数/.test(error.message));
  assert.equal(evaluateDocument(compile('root = Card([], "title=x", "description=y") // title=x')).props.title,'title=x');
  assert.equal(evaluateDocument(compile('$x = 2\nroot = Text($x == 2 ? "yes" : "no")')).props.text,'yes');
  for(const source of ['root = Text($x = 2)','root = Text((x = 2))','root = Text(x === 2)','root = Text({x: title=2})'])assert.throws(()=>compile(source),error=>error.code==='SYNTAX'&&!error.message.includes('具名参数'));
});
test('protocol marker and line comments preserve text and compile without being counted as declarations',()=>{const raw='// iui:1\n// a comment with unmatched ( [ "\nroot = Text("🎮 https://example.com/a // text") // trailing comment 🪄\n';const doc=compile(raw);assert.equal(doc.source,raw);assert.equal(evaluateDocument(doc).props.text,'🎮 https://example.com/a // text');for(const version of ['2','1.2','1garbage','01','1 // trailing'])assert.throws(()=>compile('// iui:'+version+'\nroot = Text("x")'),/协议版本/);});
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
test('drag updates are atomic and reject invalid phases, targets and coordinates',()=>{
  const scene={initial:{x:40,held:false},events:{drag:[{name:'x',value:'event.phase == "move" ? x + event.dx : x'},{name:'held',value:'event.phase == "start" || event.phase == "move"'}]},marks:[{id:'ball',type:'circle',x:{expr:'x'},y:20,r:10,interactive:true},{id:'label',type:'text',x:0,y:0,text:'fixed'}],width:200,height:100};
  const original=initialScene(scene),payload={id:'ball',x:50,y:20,dx:0,dy:0,phase:'start'};
  const start=sceneTransition(scene,original,'drag',payload),moved=sceneTransition(scene,start,'drag',{...payload,x:75,dx:25,phase:'move'}),ended=sceneTransition(scene,moved,'drag',{...payload,x:75,phase:'end'});
  assert.deepEqual(ended.values,{x:65,held:false});assert.deepEqual(original.values,{x:40,held:false});
  assert.equal(sceneTransition(scene,start,'drag',{...payload,phase:'cancel'}).values.held,false);
  for(const invalid of [{phase:'unknown'},{id:'label'},{id:'missing'},{x:201},{x:-1},{y:101},{dx:201},{dy:NaN},{dx:undefined},{extra:1}])assert.throws(()=>sceneTransition(scene,original,'drag',{...payload,...invalid}));
  const broken={...scene,events:{drag:[{name:'x',value:'x + 25'},{name:'held',value:'1/0'}]}};
  assert.throws(()=>sceneTransition(broken,original,'drag',payload));assert.deepEqual(original.values,{x:40,held:false});
});
test('restart retains declared parameters, resets dynamic state and seed, and remains atomic',()=>{
  const scene={initial:{v0:30,a:10,x:20,v:30,t:0,noise:0},seed:7,events:{reset:[{name:'v',value:'v0'},{name:'noise',value:'rand()'}],tick:[{name:'x',value:'x + v * event.dt + 0.5 * a * event.dt * event.dt'},{name:'v',value:'v + a * event.dt'}]},marks:[],width:600,height:200};
  const original={values:{v0:40,a:20,x:190,v:55,t:9,noise:0.8},seed:99};
  const restarted=sceneRestart(scene,original,['v0','a','v0']);assert.equal(restarted.values.x,20);assert.equal(restarted.values.v,40);assert.equal(restarted.values.a,20);assert.equal(restarted.values.t,0);assert.notEqual(restarted.seed,99);
  assert.deepEqual(sceneRestart(scene,original,['v0','a']),restarted,'restarting resets seeded randomness');
  const moved=sceneTransition(scene,restarted,'tick',{dt:0.1});assert.ok(Math.abs(moved.values.x-24.1)<1e-9);assert.equal(moved.values.v,42);
  const reset=sceneTransition(scene,original,'reset');assert.equal(reset.values.v0,30);assert.equal(reset.values.v,30);assert.equal(reset.values.a,10);
  assert.deepEqual(original.values,{v0:40,a:20,x:190,v:55,t:9,noise:0.8});
  for(const fields of [['missing'],['__proto__'],[2],Array(101).fill('v0'),null])assert.throws(()=>sceneRestart(scene,original,fields));
  assert.throws(()=>sceneRestart({...scene,events:{reset:[{name:'v',value:'v0'},{name:'x',value:'1/0'}]}},original,['v0']));assert.equal(original.values.x,190);
});
