import test from 'node:test';import assert from 'node:assert/strict';
import {hostFixture,until} from '../fixtures/host.mjs';
test('native streaming cancellation retains partial UI, then a new turn recovers without cross-session actions',{timeout:180000},async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});t.after(()=>release());
  const reply=async function* (payload){
    if(!payload.tools?.length){yield {delta:{content:'取消验收'},finish_reason:'stop'};return;}
    const text=JSON.stringify(payload.messages);
    if(text.includes('IUI_RECOVER')){yield {delta:{content:'恢复完成。\n```openui\nroot = NumberInput("恢复参数","recovered",3,0,10)\n```'},finish_reason:'stop'};return;}
    yield {delta:{role:'assistant',content:'内容正在生成。\n```openui\nroot = Stack([Text("流式状态"), NumberInput("待完成参数","pending",2,0,10)'} };
    await gate;yield {delta:{content:'])\n```'},finish_reason:'stop'};
  };
  const f=await hostFixture(t,{reply});const {page}=f;
  await page.getByRole('button',{name:'新建智能聊天',exact:true}).first().click();await page.getByRole('button',{name:'Intelligent UI',exact:true}).waitFor();
  const box=page.locator('[contenteditable="true"]').first();await box.fill('IUI_STREAM_CANCEL');await box.press('Enter');
  await page.locator('[data-iui-block]').first().waitFor();assert.equal(await page.locator('[data-iui-block]').first().getAttribute('aria-busy'),'true');
  const session=(await f.rpc('session/list',{_request:{}})).items.find(item=>item.running);assert.ok(session?.sessionId);
  await f.rpc('session/cancel',{request:{sessionId:session.sessionId}});release();await until(async()=>!(await f.rpc('session/list',{_request:{}})).items.find(item=>item.sessionId===session.sessionId)?.running);
  assert.ok((await page.locator('body').innerText()).includes('流式状态')||(await page.locator('body').innerText()).includes('内容正在生成。'));
  const before=f.requests.filter(p=>p.tools?.length).length;
  await box.fill('IUI_RECOVER 恢复并生成可调整参数');await box.press('Enter');await page.getByLabel('恢复参数',{exact:true}).waitFor();await until(async()=>await page.getByLabel('恢复参数',{exact:true}).isEnabled());
  await page.getByLabel('恢复参数',{exact:true}).fill('7');assert.equal(await page.getByLabel('恢复参数',{exact:true}).inputValue(),'7');assert.equal(f.requests.filter(p=>p.tools?.length).length,before+1);
  assert.deepEqual(f.errors,[]);
});
