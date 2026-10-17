import { chromium } from 'playwright';
import { hostFixture } from './host.mjs';

export const originalRows = [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }];
export const reorderedRows = [originalRows[2], originalRows[0], originalRows[1]];
export const duplicateRows = [{ name: '同值' }, { name: '同值' }, { name: '其他' }];
export const legacyPicked = { selected: 0, sort: 'name', direction: 'desc', privateExtra: { text: 'KEEP-NATIVE-EXTRA', values: [0, false, ''] } };
export const unrelated = { legacy: ['keep', false, 0], note: 'KEEP-UNRELATED-NATIVE' };
export const legacyState = { records: originalRows, picked: legacyPicked, unrelated };

const submit = text => ({ type: 'submit', text, fields: ['records', 'picked', 'unrelated'] });
export const source = `$records = ${JSON.stringify(originalRows)}\n$visible = true\nroot = Stack([
  Tabs(["记录","说明"],[$visible ? Table(["id","name"],$records,"原生事务记录","picked") : Text("表格已退出"),Text("说明页面")],"tableTab","记录"),
  Text($picked.selected == null ? "当前：无" : concat("当前：",$records[$picked.selected].name)),
  Button("重排并提交",${JSON.stringify([{ type: 'set', name: 'records', value: reorderedRows }, submit('TABLE_NATIVE_REORDER')])}),
  Button("提交当前",${JSON.stringify(submit('TABLE_NATIVE_SELECTED'))}),
  Button("载入重复行",${JSON.stringify({ type: 'set', name: 'records', value: duplicateRows })}),
  Button("提交重复当前",${JSON.stringify(submit('TABLE_NATIVE_DUPLICATE'))}),
  Button("退出表格并提交",${JSON.stringify([{ type: 'set', name: 'visible', value: false }, submit('TABLE_NATIVE_EXIT')])}),
  Button("显示表格",${JSON.stringify({ type: 'set', name: 'visible', value: true })})
])`;

export function parsePayload(text) {
  const marker = '\n\n所选设置：\n', at = text.indexOf(marker);
  if (at < 0) throw new Error('Native user message has no selected-settings payload');
  return JSON.parse(text.slice(at + marker.length));
}

export async function transactionHost(t) {
  let modelTurns = 0;
  const cft = process.env.CFT_EXECUTABLE ?? chromium.executablePath(), launch = chromium.launch;
  // Only this test process selects CFT explicitly. The shared host fixture and
  // product code remain intact; this provider replays synthetic responses.
  chromium.launch = options => launch.call(chromium, { ...options, executablePath: cft });
  let f;
  try {
    f = await hostFixture(t, { reply: payload => {
      if (!payload.tools?.length) return [{ delta: { content: '原生表格事务验收' }, finish_reason: 'stop' }];
      const text = ++modelTurns === 1 ? `固定表格可以重排、显式选择及载入重复行。\n\n\`\`\`openui\n${source}\n\`\`\`` : '已接纳当前表格快照。';
      return [{ delta: { role: 'assistant', content: text }, finish_reason: 'stop' }];
    } });
  } finally { chromium.launch = launch; }
  return { ...f, get modelTurns() { return modelTurns; }, cft };
}
