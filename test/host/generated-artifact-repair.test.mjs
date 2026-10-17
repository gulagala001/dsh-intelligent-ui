import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {hostFixture,until} from '../fixtures/host.mjs';
import {splitResponse} from '../../src/protocol/split.mjs';
import {compile} from '../../src/runtime/evaluate.mjs';

// Exact generated synthetic plan texts, replayed without any external model.
const invalidResponse="```openui\nplans = [{套餐:\"轻量\",月费:29,容量:100},{套餐:\"标准\",月费:59,容量:500},{套餐:\"专业\",月费:99,容量:2000}]\nroot = Tabs([{label:\"套餐表\",value:\"table\"},{label:\"月费图\",value:\"chart\"}],[\n  Stack([\n    Text(\"点击表头可切换排序。\",\"neutral\",\"sm\"),\n    Table([{key:\"套餐\",label:\"套餐\"},{key:\"月费\",label:\"月费\",align:\"right\",format:\"number\"},{key:\"容量\",label:\"容量（GB）\",align:\"right\",format:\"number\"}],plans,\"三款虚构套餐\")\n  ]),\n  Stack([\n    Text(\"可筛选套餐、选择柱形数据，并切换系列显示。月费与容量使用不同尺度，默认显示月费。\",\"neutral\",\"sm\"),\n    Chart(\"bar\",plans,\"套餐\",[{key:\"月费\",label:\"月费\",unit:\"月费\",color:\"blue\"},{key:\"容量\",label:\"容量\",unit:\"GB\",color:\"green\"}],\"套餐月费比较\",\"plan_chart\",true,\"category\")\n  ])\n],\"plan_tabs\",\"table\")\n```";
const validSource="plans = [{name:\"轻量\",fee:29,capacity:100},{name:\"标准\",fee:59,capacity:500},{name:\"专业\",fee:99,capacity:2000}]\n\nroot = Tabs(\n  [{label:\"套餐表\",value:\"table\"},{label:\"月费图\",value:\"chart\"}],\n  [\n    Stack([\n      Text(\"点击列标题可切换排序。\",\"neutral\",\"sm\"),\n      Table(\n        [{key:\"name\",label:\"套餐\"},{key:\"fee\",label:\"月费\",align:\"right\",format:\"number\"},{key:\"capacity\",label:\"容量（GB）\",align:\"right\",format:\"number\"}],\n        plans,\n        \"三款虚构套餐\",\n        \"plan_table\"\n      )\n    ]),\n    Stack([\n      Text(\"可筛选套餐、选择柱形数据，并切换系列显示。月费与容量使用不同单位，分开显示。\",\"neutral\",\"sm\"),\n      Chart(\n        \"bar\",\n        plans,\n        \"name\",\n        [{key:\"fee\",label:\"月费\",unit:\"每月\",color:\"blue\"},{key:\"capacity\",label:\"容量\",unit:\"GB\",color:\"green\"}],\n        \"套餐对比：月费 / 容量\",\n        \"plan_chart\",\n        true,\n        \"category\"\n      )\n    ])\n  ],\n  \"plan_tabs\",\n  \"table\"\n)\n";

const digest=value=>createHash('sha256').update(value).digest('hex');
const gate=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes});return{promise,resolve}};
const textOf=content=>(content??[]).filter(part=>part.type==='text').map(part=>part.text).join('\n');
const requestOf=request=>request.postDataJSON().payload.args.request;

test('captured generated artifact recovers through native repair retries, preserves ownership and survives restart', {timeout:300000},async t=>{
  assert.throws(()=>compile(splitResponse(invalidResponse).find(part=>part.kind==='ui').text),/不支持的符号 套/);
  assert.doesNotThrow(()=>compile(validSource));
  if(process.env.IUI_REPAIR_ORIGINAL_RESPONSE){const original=JSON.parse(await readFile(process.env.IUI_REPAIR_ORIGINAL_RESPONSE,'utf8'));assert.equal(original.text,invalidResponse);}
  if(process.env.IUI_REPAIR_VALID_EXPORT){const original=JSON.parse(await readFile(process.env.IUI_REPAIR_VALID_EXPORT,'utf8'));assert.equal(original.source,validSource);}
  const files=['lib/client.js','src/client/Surface.jsx','src/client/host/session.mjs','src/client/components/data.jsx','src/client/components/interactive.jsx','src/client/document-store.mjs','src/protocol/parse.mjs','src/runtime/evaluate.mjs'];
  const hashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,digest(await readFile(file))])));
  if(process.env.IUI_REPAIR_EXPECTED_CLIENT_SHA)assert.equal(hashes['lib/client.js'],process.env.IUI_REPAIR_EXPECTED_CLIENT_SHA);
  const navigationGate=gate(),receiptGate=gate(),modelGate=gate();
  t.after(()=>{navigationGate.resolve();receiptGate.resolve();modelGate.resolve()});
  let phase='old',modelRepairStarted=false;
  const oldSource='root = Input("旧会话备注","note","OLD-DEFAULT")';
  const replies=async function*(payload){
    if(!payload.tools?.length){yield{delta:{content:'生成作品修复验收'},finish_reason:'stop'};return;}
    let reply='其他会话旧消息';
    if(phase==='old')reply=`\`\`\`openui\n${oldSource}\n\`\`\``;
    else if(phase==='invalid')reply=invalidResponse;
    else if(phase==='repair'){
      modelRepairStarted=true;yield{delta:{role:'assistant',content:'已重新生成合法交互作品。\n'}};await modelGate.promise;
      reply=`\`\`\`openui\n${validSource}\`\`\``;
    }
    yield{delta:{content:reply},finish_reason:'stop'};
  };
  // This test process explicitly selects the installed CFT instead of the
  // Playwright headless-shell default; the shared fixture remains unchanged.
  const cft=process.env.CFT_EXECUTABLE??chromium.executablePath(),launch=chromium.launch;
  let f;chromium.launch=options=>launch.call(chromium,{...options,executablePath:cft});
  try{f=await hostFixture(t,{reply:replies});}finally{chromium.launch=launch;}
  const {page}=f,submissions=[],routeErrors=[],repairFiles=[];
  await page.route('**/api/session/uploadFileBinary?**',async route=>{
    try{const file=JSON.parse(route.request().postDataBuffer().toString('utf8'));repairFiles.push(file);assert.equal(file.session,sessionId);assert.equal(file.sourceChunks.join(''),splitResponse(invalidResponse).find(part=>part.kind==='ui').text);assert.equal(file.sourceRevision,digest(file.sourceChunks.join('')));await route.continue();}
    catch(error){routeErrors.push(error.message);await route.abort().catch(()=>{});}
  });
  const create=async text=>{
    const{sessionId}=await f.rpc('session/create',{request:{workspaceId:f.workspace.workspace.workspaceId,agentPreset:'intelligent-chat'}});
    await f.rpc('session/selectModel',{request:{sessionId,provider:'fixture',model:'fixture'}});
    await f.rpc('session/prompt',{request:{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text}],clientTimeZone:'UTC'}});
    await until(async()=>!(await f.rpc('session/list',{_request:{}})).items.find(item=>item.sessionId===sessionId)?.running);return sessionId;
  };
  const sessionId=await create('REPAIR_OLD_SESSION_DATA');phase='other';const otherId=await create('REPAIR_OTHER_SESSION_DATA');
  await page.locator(`[data-row-key="session:${sessionId}"]`).click();
  const old=page.locator('.iui-surface').filter({has:page.getByRole('textbox',{name:'旧会话备注',exact:true})}).first();
  await old.getByRole('textbox',{name:'旧会话备注',exact:true}).fill('KEEP-OLD-DRAFT');
  await old.getByRole('status').filter({hasText:'已保存'}).waitFor();
  phase='invalid';await f.rpc('session/prompt',{request:{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'REPAIR_REPLAY_INVALID_GENERATION'}],clientTimeZone:'UTC'}});
  let invalid=page.locator('.iui-surface').filter({has:page.getByRole('button',{name:'修复',exact:true})}).first();
  await invalid.getByRole('alert').filter({hasText:'不支持的符号 套'}).waitFor();
  const invalidBlock=await invalid.getAttribute('data-iui-block');invalid=page.locator(`[data-iui-block="${invalidBlock}"]`).first();assert.equal(await invalid.locator('table,svg').count(),0);
  let failedId,canceledId,successfulId;
  await page.route('**/api/session/prompt',async route=>{
    try{
      const request=requestOf(route.request()),text=textOf(request.content);assert.match(text,/请修复我选中的这份交互作品/);assert.equal(request.content.filter(part=>part.type==='file').length,1);assert.equal(repairFiles.at(-1).block,invalidBlock);assert.match(repairFiles.at(-1).diagnosticChunks.join(''),/不支持的符号 套/);
      submissions.push({requestId:request.requestId,sessionId:request.sessionId,text,mode:request.mode});
      if(submissions.length===1){
        failedId=request.requestId;const body=route.request().postDataJSON();body.payload.args.request.clientTimeZone='IUI/Invalid-Time-Zone';
        const response=await route.fetch({postData:JSON.stringify(body)}),result=await response.json();
        assert.equal(result.result.ok,false);assert.equal(result.result.error.code,'session/invalid-time-zone');await route.fulfill({response});return;
      }
      if(submissions.length===2){canceledId=request.requestId;await navigationGate.promise;await route.abort('aborted').catch(()=>{});return;}
      assert.equal(submissions.length,3,'repair retries are bounded');successfulId=request.requestId;
      const response=await route.fetch(),result=await response.json();assert.equal(result.result.ok,true);
      await receiptGate.promise;await route.fulfill({response});
    }catch(error){routeErrors.push(error.message);await route.abort().catch(()=>{});}
  });
  const repair=()=>invalid.getByRole('button',{name:'修复',exact:true});
  await repair().click();await invalid.getByRole('status').filter({hasText:'clientTimeZone'}).waitFor();
  await until(()=>repair().isEnabled());assert.equal(submissions.length,1);
  await repair().click();await until(()=>canceledId);
  const aborted=page.waitForEvent('requestfailed',{predicate:request=>request.url().endsWith('/api/session/prompt')&&requestOf(request).requestId===canceledId,timeout:5000});
  await page.locator(`[data-row-key="session:${otherId}"]`).click();await aborted;navigationGate.resolve();
  await page.locator(`[data-row-key="session:${sessionId}"]`).click();await until(()=>repair().isEnabled());
  phase='repair';await repair().click();await until(()=>successfulId&&modelRepairStarted);
  assert.equal(await invalid.getByRole('button',{name:'正在请求修复…',exact:true}).isDisabled(),true);
  assert.equal(submissions.every(item=>item.sessionId===sessionId&&item.mode==='queue'),true);
  receiptGate.resolve();modelGate.resolve();
  const fixed=page.locator('.iui-surface').filter({has:page.getByRole('tab',{name:'套餐表',exact:true})}).last();
  await fixed.getByRole('tab',{name:'套餐表',exact:true}).waitFor();await until(async()=>await fixed.getAttribute('aria-busy')==='false');
  assert.equal(await fixed.getByRole('alert').count(),0);assert.equal(await old.getByRole('textbox',{name:'旧会话备注',exact:true}).inputValue(),'KEEP-OLD-DRAFT');
  const count=f.requests.length;
  await fixed.getByRole('tab',{name:'套餐表',exact:true}).click();const sort=fixed.locator('.iui-table-sort').filter({hasText:'月费'}).first();await sort.click();await sort.click();
  const rows=await fixed.locator('tbody tr:visible').allTextContents();assert.equal(rows.length,3);assert.match(rows[0],/99/);assert.match(rows[2],/29/);
  await fixed.getByRole('tab',{name:'月费图',exact:true}).click();await fixed.locator('.iui-chart svg').waitFor();
  await fixed.locator('.iui-chart-data summary').click();await fixed.locator('.iui-data-select').first().click();
  assert.equal(await fixed.locator('.iui-data-select').first().getAttribute('aria-pressed'),'true');
  const legend=fixed.locator('.iui-chart-legend button').first();await legend.click();assert.equal(await legend.getAttribute('aria-pressed'),'false');
  await fixed.getByRole('status').filter({hasText:'已保存'}).waitFor();
  const block=await fixed.getAttribute('data-iui-block');const saved=await f.api(`/state?session=${sessionId}&block=${block}`);assert.equal(saved.status,200);
  assert.equal(saved.body.state.plan_tabs,'chart');assert.equal(saved.body.state.plan_table.direction,'desc');assert.equal(saved.body.state.plan_chart.selected,0);
  await fixed.getByRole('button',{name:'更多交互内容操作',exact:true}).click();const downloading=page.waitForEvent('download');await fixed.getByRole('button',{name:'导出',exact:true}).click();
  const exported=JSON.parse(await readFile(await(await downloading).path(),'utf8'));assert.equal(exported.source.trim(),validSource.trim());assert.deepEqual(exported.state,saved.body.state);
  const restore=async()=>{
    await fixed.getByRole('tab',{name:'月费图',exact:true}).waitFor();await until(async()=>await fixed.getAttribute('aria-busy')==='false');
    assert.equal(await fixed.getByRole('tab',{name:'月费图',exact:true}).getAttribute('aria-selected'),'true');
    await fixed.locator('.iui-chart-data summary').click();assert.equal(await fixed.locator('.iui-data-select').first().getAttribute('aria-pressed'),'true');
    assert.equal(await fixed.locator('.iui-chart-legend button').first().getAttribute('aria-pressed'),'false');
    await until(()=>old.getByRole('textbox',{name:'旧会话备注',exact:true}).isEnabled());
    assert.equal(await old.getByRole('textbox',{name:'旧会话备注',exact:true}).inputValue(),'KEEP-OLD-DRAFT');
    const current=await f.api(`/state?session=${sessionId}&block=${block}`);assert.deepEqual(current.body.state,exported.state);
  };
  await page.reload();await restore();await f.stop();
  const durable=await f.persistedSession(sessionId),foreign=await f.persistedSession(otherId),user=durable.rows.filter(row=>row.type==='user/message');
  assert.equal(user.filter(event=>event.data.source?.rpcId===successfulId).length,1);
  assert.equal(user.some(event=>[failedId,canceledId].includes(event.data.source?.rpcId)),false);
  assert.ok(user.some(event=>textOf(event.data.content)==='REPAIR_OLD_SESSION_DATA'));
  for(const item of submissions)assert.ok(!foreign.text.includes(item.requestId));
  await page.goto(await f.boot());await page.locator(`[data-row-key="session:${sessionId}"]`).click();await restore();
  assert.equal(f.requests.length,count,'local operations and reload/restart do not ask the model again');assert.deepEqual(f.errors,[]);assert.deepEqual(routeErrors,[]);
  for(const file of files)assert.equal(digest(await readFile(file)),hashes[file],'accepted source/build changed during replay: '+file);
  const directory=resolve(process.env.IUI_REPAIR_EVIDENCE??'work/generated-artifact-repair');await mkdir(directory,{recursive:true,mode:0o700});
  await page.screenshot({path:join(directory,'generated-artifact-repair.png'),fullPage:true});
  await writeFile(join(directory,'generated-artifact-repair.result.json'),JSON.stringify({ranAt:new Date().toISOString(),mode:'controlled replay of captured generated source',realModelCalled:false,
    actualHostVersion:'0.2.1-alpha.2',cftExecutable:cft,browserVersion:f.browser.version(),sourceSHA256:hashes,packageSHA256:digest(await readFile(f.tar)),
    invalidResponseSHA256:digest(invalidResponse),validSourceSHA256:digest(validSource),sessionId,otherId,invalidBlock,repairedBlock:block,
    initialError:'不支持的符号 套',submissions,rejectionCode:'session/invalid-time-zone',successfulRequestId:successfulId,
    completeTabsTableChart:true,oldSessionDraftPreserved:true,reloadPassed:true,restartPassed:true,noCrossSessionOwnership:true,routeErrors,pageErrors:f.errors},null,2)+'\n',{mode:0o600});
  await writeFile(join(directory,'repaired-export.json'),JSON.stringify(exported,null,2)+'\n',{mode:0o600});
});
