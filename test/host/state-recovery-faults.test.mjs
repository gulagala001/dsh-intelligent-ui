import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { hostFixture, until } from '../fixtures/host.mjs';

const source='root = Stack([Heading("月度预算"),Text("点击金额排序，或隐藏图表分类查看占比变化。"),Chart("pie",[{name:"房租",amount:2200},{name:"餐饮",amount:1200},{name:"交通",amount:400}],"name",["amount"],"预算分配","budgetChart"),Table([{key:"name",label:"类别"},{key:"amount",label:"金额",format:"currency"}],[{name:"房租",amount:2200},{name:"餐饮",amount:1200},{name:"交通",amount:400}],"支出明细","budgetTable")])';
const evidenceRoot=()=>resolve(process.env.IUI_STATE_EVIDENCE??'work/rea-parity/native/state-recovery');
const stateURL=(session,block)=>`/state?session=${encodeURIComponent(session)}&block=${encodeURIComponent(block)}`;
async function findStateRecord(home,session,block){
  const filename=createHash('sha256').update(`${session}\0${block}`).digest('hex')+'.json',matches=[];
  const walk=async directory=>{for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory()&&!entry.isSymbolicLink())await walk(path);else if(entry.isFile()&&entry.name===filename&&basename(directory)==='state'&&basename(dirname(directory))==='intelligent-ui')matches.push(path);}};
  await walk(home);assert.equal(matches.length,1,'one actually saved native state file must exist in the fixture HOME');return matches[0];
}

test('packaged native state EIO preserves table/chart draft, retries atomically and restores shared artwork after restart', {timeout:300000}, async t=>{
  const evidence=evidenceRoot();await mkdir(evidence,{recursive:true,mode:0o700});
  const f=await hostFixture(t,{stateWriteFault:true,reply:`这是可调整的月度预算。\n\n\`\`\`openui\n${source}\n\`\`\`\n\n筛选与排序会保存在这条回答中。`});
  const {sessionId}=await f.rpc('session/create',{request:{workspaceId:f.workspace.workspace.workspaceId,agentPreset:'intelligent-chat'}});
  await f.rpc('session/selectModel',{request:{sessionId,provider:'fixture',model:'fixture'}});
  await f.rpc('session/prompt',{request:{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'IUI_STATE_RECOVERY_PUBLIC_BUDGET'}],clientTimeZone:'Asia/Shanghai'}});
  await until(async()=>(await f.rpc('session/list',{_request:{}})).items.find(item=>item.sessionId===sessionId&&!item.running&&!item.blank));
  await f.page.locator(`[data-row-key="session:${sessionId}"]`).click();
  const surface=f.page.locator('[data-iui-block]').first();await surface.locator('.iui-chart svg').waitFor();
  await until(async()=>(await surface.innerText()).includes('已保存'));
  const block=await surface.getAttribute('data-iui-block');
  await surface.locator('.iui-table-sort').filter({hasText:'类别'}).click();
  await surface.locator('.iui-table-sort').filter({hasText:'类别'}).click();
  await until(async()=>(await surface.innerText()).includes('已保存'));
  const before=await f.api(stateURL(sessionId,block));assert.equal(before.status,200);assert.ok(before.body.revision>=1,'fault must replace an already saved record');
  assert.equal(before.body.state.budgetTable.sort,'name');assert.equal(before.body.state.budgetTable.direction,'desc');
  const recordPath=await findStateRecord(f.home,sessionId,block),beforeBytes=await readFile(recordPath);
  assert.deepEqual(JSON.parse(beforeBytes.toString()),before.body,'the non-default baseline actually exists on disk and agrees with the native API');
  const requestCount=f.requests.length;
  await f.armStateWriteFailure();
  const failedResponse=f.page.waitForResponse(response=>response.request().method()==='POST'&&response.url().includes('/intelligent-ui/api/state'));
  await surface.locator('.iui-table-sort').filter({hasText:'金额'}).click();
  await surface.locator('.iui-chart-legend-item').filter({hasText:'餐饮'}).click();
  const failure=await failedResponse;assert.equal(failure.status(),500,'the real StateService reports injected disk failure');
  await surface.getByRole('button',{name:'重试保存',exact:true}).waitFor();
  const hits=await f.stateWriteFaults();assert.equal(hits.length,1);assert.equal(hits[0].code,'EIO');
  const backups=await f.page.evaluate(prefix=>Object.keys(sessionStorage).filter(key=>key===prefix||key.startsWith(prefix+':')).map(key=>({key,draft:JSON.parse(sessionStorage.getItem(key))})),`dsh-iui.draft.v1:${sessionId}:${block}`);
  const backup=backups.find(item=>createHash('sha256').update(item.draft.source).digest('hex')===before.body.sourceRevision);
  const draft=backup?.draft;
  assert.ok(draft);assert.ok(draft.dirty.includes('budgetTable'));assert.ok(draft.dirty.includes('budgetChart'));
  assert.equal(draft.state.budgetTable.sort,'amount');assert.equal(draft.state.budgetTable.direction,'asc');assert.equal(draft.state.budgetChart.hiddenCategories.length,1);
  assert.equal(await surface.getByRole('region',{name:'支出明细',exact:true}).locator('tbody tr').first().innerText().then(text=>text.includes('交通')),true);
  assert.equal(await surface.locator('.iui-chart-legend-item').filter({hasText:'餐饮'}).getAttribute('aria-pressed'),'false');
  const afterFailure=await f.api(stateURL(sessionId,block));assert.equal(afterFailure.status,200);assert.deepEqual(afterFailure.body,before.body,'failed atomic replacement preserves the old server record');
  assert.equal(hits[0].target,recordPath,'fault targets the existing baseline record');
  assert.deepEqual(await readFile(recordPath),beforeBytes,'failed replacement preserves the existing disk file byte for byte');
  assert.ok(!(await readdir(dirname(hits[0].target))).some(name=>name.endsWith('.tmp')),'failed write removes its temporary file');
  const successfulResponse=f.page.waitForResponse(response=>response.request().method()==='POST'&&response.url().includes('/intelligent-ui/api/state'));
  await surface.getByRole('button',{name:'重试保存',exact:true}).click();assert.equal((await successfulResponse).status(),200);
  await until(async()=>(await surface.innerText()).includes('已保存'));
  const saved=await f.api(stateURL(sessionId,block));assert.equal(saved.status,200);assert.deepEqual(saved.body.state,draft.state);
  assert.deepEqual(JSON.parse(await readFile(hits[0].target,'utf8')),saved.body,'disk, native API and Web draft agree');
  assert.equal(await f.page.evaluate(key=>sessionStorage.getItem(key),backup.key),null,'successful save clears the dirty journal');
  assert.equal((await f.stateWriteFaults()).length,1,'the armed fault is consumed exactly once');
  assert.equal(f.requests.length,requestCount,'sorting, filtering, failure and retry never request a model');
  await surface.getByRole('button',{name:'展开交互内容',exact:true}).click();
  const pane=f.page.locator('.iui-artifact-pane');await pane.locator('.iui-chart svg').waitFor();
  assert.equal(await pane.locator('.iui-chart-legend-item').filter({hasText:'餐饮'}).getAttribute('aria-pressed'),'false');
  await f.stop();await f.page.goto(await f.boot());await f.page.locator(`[data-row-key="session:${sessionId}"]`).click();
  await surface.locator('.iui-chart svg').waitFor();await until(async()=>(await surface.innerText()).includes('已保存'));
  assert.equal(await surface.locator('.iui-table th[aria-sort="ascending"]').innerText().then(text=>text.includes('金额')),true);
  assert.ok((await surface.getByRole('region',{name:'支出明细',exact:true}).locator('tbody tr').first().innerText()).includes('交通'));
  assert.equal(await surface.locator('.iui-chart-legend-item').filter({hasText:'餐饮'}).getAttribute('aria-pressed'),'false');
  assert.deepEqual((await f.api(stateURL(sessionId,block))).body.state,draft.state);
  const screenshots=[];
  if(process.env.IUI_TEST_HOST_VERSION==='0.2.1-alpha.2'&&!process.env.IUI_TEST_OMD_PACKAGE){
    for(const theme of ['light','dark']){
      await f.page.emulateMedia({colorScheme:theme});await f.page.reload();await surface.locator('.iui-chart svg').waitFor();
      await until(async()=>await f.page.evaluate(expected=>document.body.hasAttribute('data-ds-dark-theme')===expected,theme==='dark'));
      await until(async()=>(await surface.innerText()).includes('已保存'));
      for(const width of [1280,320]){
        await f.page.setViewportSize({width,height:900});await surface.scrollIntoViewIfNeeded();
        const path=join(evidence,`stock-budget-${theme}-${width}.png`);await f.page.screenshot({path,fullPage:true});screenshots.push(path);
      }
      await f.page.setViewportSize({width:1280,height:900});
    }
  }
  assert.deepEqual(f.errors,[]);
  await writeFile(join(evidence,'state-recovery-result.json'),JSON.stringify({hostVersion:process.env.IUI_TEST_HOST_VERSION,health:(await f.api('/health')).body,packageSha256:createHash('sha256').update(await readFile(f.tar)).digest('hex'),sessionId,block,source,baselineRecord:before.body,baselineDiskSha256:createHash('sha256').update(beforeBytes).digest('hex'),failedReplacementPreservedDiskBytes:true,injectedFault:hits[0],failedHTTPStatus:failure.status(),savedRecord:saved.body,recoveredState:draft.state,sharedPaneRestored:true,screenshots,externalModelRequests:0},null,2),{mode:0o600});
});

test('packaged native cancellation excludes late content from durable Session events and continues on the same Session', {timeout:180000}, async t=>{
  const late='IUI_FORBIDDEN_LATE_FRAGMENT_61941',started='IUI_CANCELLED_PARTIAL_61941',recovered='IUI_DURABLE_RECOVERY_61941';
  let release,lateDelivered=false;const gate=new Promise(resolve=>{release=resolve;});t.after(()=>release());
  const f=await hostFixture(t,{reply:async function*(payload){
    if(!payload.tools?.length){yield{delta:{content:'取消与持久恢复'},finish_reason:'stop'};return;}
    if(JSON.stringify(payload.messages).includes('IUI_PERSISTED_CONTINUE')){yield{delta:{content:`${recovered}\n\`\`\`openui\nroot = NumberInput("恢复后的参数","restored",3,0,10)\n\`\`\``},finish_reason:'stop'};return;}
    yield{delta:{role:'assistant',content:`${started}\n\`\`\`openui\nroot = Text("正在生成")`}};
    await gate;lateDelivered=true;yield{delta:{content:`\n\`\`\`\n${late}`},finish_reason:'stop'};
  }});
  const {sessionId}=await f.rpc('session/create',{request:{workspaceId:f.workspace.workspace.workspaceId,agentPreset:'intelligent-chat'}});
  await f.rpc('session/selectModel',{request:{sessionId,provider:'fixture',model:'fixture'}});
  const prompt=text=>f.rpc('session/prompt',{request:{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text}],clientTimeZone:'UTC'}});
  await prompt('IUI_PERSISTED_CANCEL');await f.page.locator(`[data-row-key="session:${sessionId}"]`).click();
  await f.page.getByText(started,{exact:false}).first().waitFor();
  await f.rpc('session/cancel',{request:{sessionId}});release();await until(()=>lateDelivered);
  await until(async()=>!(await f.rpc('session/list',{_request:{}})).items.find(item=>item.sessionId===sessionId)?.running);
  await f.stop();const cancelled=await f.persistedSession(sessionId);
  assert.ok(cancelled.text.includes(started),'the actual durable events contain the accepted partial response');assert.ok(!cancelled.text.includes(late),'late provider content is absent from native disk events');
  await f.page.goto(await f.boot());await f.page.locator(`[data-row-key="session:${sessionId}"]`).click();await prompt('IUI_PERSISTED_CONTINUE');
  await f.page.getByLabel('恢复后的参数',{exact:true}).waitFor();await until(()=>f.page.getByLabel('恢复后的参数',{exact:true}).isEnabled());
  await f.page.getByLabel('恢复后的参数',{exact:true}).fill('7');
  await until(async()=>(await f.page.locator('[data-iui-block]').last().innerText()).includes('已保存'));
  await f.stop();const continued=await f.persistedSession(sessionId);assert.ok(continued.text.includes(recovered));assert.ok(!continued.text.includes(late));
  assert.deepEqual(f.errors,[]);const evidence=evidenceRoot();await mkdir(evidence,{recursive:true,mode:0o700});
  await writeFile(join(evidence,'cancelled-native-session.jsonl'),cancelled.text,{mode:0o600});await writeFile(join(evidence,'continued-native-session.jsonl'),continued.text,{mode:0o600});
  await writeFile(join(evidence,'durable-cancel-result.json'),JSON.stringify({sessionId,lateDelivered,latePersisted:false,cancelledFile:cancelled.path,continuedFile:continued.path,cancelledFrames:cancelled.frames,continuedFrames:continued.frames,cancelledRows:cancelled.rows.length,continuedRows:continued.rows.length,continuedAfterRestart:true,externalModelRequests:0},null,2),{mode:0o600});
});
