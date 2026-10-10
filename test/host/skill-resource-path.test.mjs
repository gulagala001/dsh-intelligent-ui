import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hostFixture, until } from '../fixtures/host.mjs';

test('dedicated packaged prompt locates chart references through the native read tool outside session cwd', { timeout: 180000 }, async t => {
  const evidence=resolve(process.env.IUI_RESOURCE_EVIDENCE??'work/latest-chat-error-20261010/native-resource');
  await mkdir(evidence,{recursive:true,mode:0o700});
  let resourceBase,readResult;
  const f=await hostFixture(t,{reply:payload=>{
    if(!payload.tools?.length)return [{delta:{content:'资源路径验收'},finish_reason:'stop'}];
    const system=payload.messages.filter(message=>message.role==='system').map(message=>typeof message.content==='string'?message.content:JSON.stringify(message.content)).join('\n');
    const match=system.match(/The resource base for the following skill is ("(?:[^"\\]|\\.)*")\./);
    if(!match)return [{delta:{content:'Missing installed resource base'},finish_reason:'stop'}];
    resourceBase=JSON.parse(match[1]);
    readResult=payload.messages.find(message=>message.role==='tool'&&message.tool_call_id==='iui-chart-reference');
    if(!readResult)return [{delta:{role:'assistant',tool_calls:[{index:0,id:'iui-chart-reference',type:'function',function:{name:'read',arguments:JSON.stringify({file_path:join(resourceBase,'references/data.md'),limit:100})}}]},finish_reason:'tool_calls'}];
    return [{delta:{content:'已读取已安装图表资料。\n```openui\nroot = Chart("bar",[{month:"一月",value:12},{month:"二月",value:18}],"month",["value"],"图表资料验收")\n```'},finish_reason:'stop'}];
  }});
  const {sessionId}=await f.rpc('session/create',{request:{workspaceId:f.workspace.workspace.workspaceId,agentPreset:'intelligent-chat'}});
  await f.rpc('session/selectModel',{request:{sessionId,provider:'fixture',model:'fixture'}});
  await f.rpc('session/prompt',{request:{requestId:crypto.randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'IUI_CHART_REFERENCE_NATIVE_PROBE'}],clientTimeZone:'Asia/Shanghai'}});
  await until(async()=>(await f.rpc('session/list',{_request:{}})).items.find(item=>item.sessionId===sessionId&&!item.running&&!item.blank),60000);
  assert.ok(resourceBase,'the assembled packaged prompt includes its resource directory');
  assert.ok(!resourceBase.startsWith(f.cwd),'references resolve independently of the Session workspace');
  assert.ok(JSON.stringify(readResult?.content).includes('Chart('),'the actual native read tool returns the installed chart reference');
  assert.ok(!JSON.stringify(readResult?.content).includes('not found'));
  const nativeRequests=f.requests.filter(payload=>payload.tools?.length);
  assert.equal(nativeRequests.length,2,'one native resource read, then one final response');
  await f.page.locator(`[data-row-key="session:${sessionId}"]`).click();
  const surface=f.page.locator('[data-iui-block]').first();
  await surface.locator('svg').waitFor();
  await until(async()=>(await surface.innerText()).includes('已保存'));
  assert.equal(await surface.locator('[role="alert"]').count(),0);
  assert.deepEqual(f.errors,[]);
  await f.page.screenshot({path:join(evidence,'chart-reference.png'),fullPage:true});
  await writeFile(join(evidence,'result.json'),JSON.stringify({sessionId,resourceBase,cwd:f.cwd,nativeReadSucceeded:true,nativeRequests:nativeRequests.length,externalModelRequests:0,rendered:true},null,2),{mode:0o600});
});
