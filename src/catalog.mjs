import { z } from 'zod';

// This is the single public component contract used by the compiler and skills.
const text = z.string().max(16000);
const name = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
const number = z.number().finite();
const scalar = z.union([text, number, z.boolean(), z.null()]);
const children = z.array(z.unknown()).max(500);
const optionalText = text.nullish();
const bind = name.optional();
const tone = z.enum(['neutral', 'info', 'success', 'warning', 'danger']).default('neutral');
const gap = z.union([z.enum(['none', 'xs', 'sm', 'md', 'lg']), z.number().finite().min(0).max(48)]).default('md');
const option = z.union([scalar, z.object({ label: text, value: scalar, disabled: z.boolean().optional() }).strict()]);
const options = z.array(option).max(200);
const json = z.json();
const actionItem = z.union([
  z.object({ type: z.literal('set'), name, value: json }).strict(),
  z.object({ type: z.literal('reset'), name }).strict(),
  z.object({ type: z.literal('submit'), text, fields: z.array(name).max(100).optional() }).strict(),
]);
const action = z.union([actionItem, z.array(actionItem).min(1).max(30)]);
export const fieldSchema = z.object({
  name, label: text, type: z.enum(['text', 'number', 'select', 'checkbox', 'slider', 'textarea']).default('number'),
  value: scalar.optional(), placeholder: optionalText, hint: optionalText,
  min: number.nullish(), max: number.nullish(), step: number.positive().nullish(),
  required: z.boolean().optional(), options: options.optional(), unit: optionalText,
}).strict();
const fields = z.array(fieldSchema).max(100);
const formula = text.max(4000);
const metric = z.object({ label: text, formula, unit: optionalText, precision: z.number().int().min(0).max(10).optional() }).strict();
const exprValue = z.union([scalar, z.object({ expr: formula }).strict()]);
const exprBoolean = z.union([z.boolean(), z.object({ expr: formula }).strict()]);
const sceneAction = z.object({
  id: text.max(128), label: exprValue, detail: exprValue.optional(),
  symbol: z.union([z.string().max(16), z.object({ expr: formula }).strict()]).optional(),
  selected: exprBoolean.optional(), disabled: exprBoolean.optional(), color: exprValue.optional(),
  shortcut: z.string().length(1).regex(/^[A-Za-z0-9]$/).optional(),
}).strict();
const mark = z.object({
  id: text.max(128), type: z.enum(['circle', 'rect', 'line', 'text', 'path']),
  x: exprValue.optional(), y: exprValue.optional(), x2: exprValue.optional(), y2: exprValue.optional(),
  width: exprValue.optional(), height: exprValue.optional(), r: exprValue.optional(),
  text: exprValue.optional(), fill: exprValue.optional(), stroke: exprValue.optional(),
  strokeWidth: exprValue.optional(), opacity: exprValue.optional(), fontSize: exprValue.optional(),
  points: z.union([z.array(z.array(number).length(2)).max(1000), z.object({ expr: formula }).strict()]).optional(),
  label: optionalText, interactive: z.boolean().optional(),
}).strict();
export const sceneSchema = z.object({
  initial: z.record(name, json), seed: z.number().int().min(0).max(4294967295).optional(),
  events: z.partialRecord(z.enum(['click', 'key', 'tick', 'reset', 'drag']), z.array(z.object({ name, value: formula }).strict()).max(100)),
  marks: z.array(mark).max(1000), width: number.positive().max(2000).default(600), height: number.positive().max(2000).default(320),
  actions: z.array(sceneAction).max(32).default([]),
}).strict();
function component(group, description, args, shape, childField) {
  return { group, description, args, schema: z.object(shape).strict(), ...(childField ? { children: childField } : {}) };
}
export const catalog = {
  Stack: component('layout', 'Vertical layout with responsive spacing.', ['children', 'gap'], { children, gap }, 'children'),
  Row: component('layout', 'Wrapping horizontal layout.', ['children', 'gap', 'align'], { children, gap, align: z.enum(['start', 'center', 'end', 'stretch']).default('center') }, 'children'),
  Grid: component('layout', 'Responsive equal-width columns; collapses on narrow screens.', ['children', 'columns', 'gap'], { children, columns: z.number().int().min(1).max(6).default(2), gap }, 'children'),
  Card: component('layout', 'Grouped content with optional title, description and paper treatment.', ['children', 'title', 'description', 'variant'], { children, title: optionalText, description: optionalText, variant: z.enum(['default', 'paper']).default('default') }, 'children'),
  Text: component('content', 'Plain text with preserved line breaks. No HTML.', ['text', 'tone', 'size'], { text, tone, size: z.enum(['sm', 'md', 'lg']).default('md') }),
  Heading: component('content', 'A semantic section heading.', ['text', 'level'], { text, level: z.number().int().min(2).max(4).default(2) }),
  Divider: component('content', 'A subtle section separator.', [], {}),
  Image: component('content', 'Public HTTPS image with meaningful alternative text.', ['src', 'alt', 'caption', 'aspect'], { src: z.url().max(2048), alt: text, caption: optionalText, aspect: z.enum(['auto', 'wide', 'square', 'portrait']).default('auto') }),
  Badge: component('content', 'Compact status label.', ['text', 'tone'], { text, tone }),
  Metric: component('data', 'A headline value, unit and supporting trend.', ['label', 'value', 'unit', 'detail', 'tone'], { label: text, value: scalar, unit: optionalText, detail: optionalText, tone }),
  Facts: component('data', 'Compact divided definition rows, with labels and emphasized values. Values can be computed by OpenUI expressions.', ['items', 'title'], { items: z.array(z.object({ label: text, value: scalar, unit: optionalText, detail: optionalText }).strict()).max(100), title: optionalText }),
  Table: component('data', 'Scrollable data table with client-side sorting and optional selection.', ['columns', 'rows', 'caption', 'bind'], {
    columns: z.array(z.union([text, z.object({ key: text.max(128), label: text, align: z.enum(['left', 'right', 'center']).optional(), format: z.enum(['text', 'number', 'percent', 'currency']).optional() }).strict()])).min(1).max(30),
    rows: z.array(z.union([z.record(text.max(128), scalar), z.array(scalar).max(30)])).max(1000), caption: optionalText, bind,
  }),
  Chart: component('data', 'Interactive SVG line, area, bar, scatter or pie chart with accessible raw data table. Explicit series units keep compatible scales together; optional category filters and category colors support local comparison.', ['type', 'data', 'x', 'series', 'title', 'bind', 'categoryFilters', 'colorBy'], {
    type: z.enum(['line', 'area', 'bar', 'scatter', 'pie']).default('line'),
    data: z.array(z.record(text.max(128), scalar)).max(1000), x: text.max(128),
    series: z.array(z.union([text.max(128), z.object({ key: text.max(128), label: text, color: z.enum(['blue', 'green', 'orange', 'purple', 'red', 'gray']).optional(), unit: z.string().max(40).optional() }).strict()])).min(1).max(12),
    title: optionalText, bind, categoryFilters: z.boolean().default(false), colorBy: z.enum(['series', 'category']).default('series'),
  }),
  Button: component('inputs', 'Explicit user-triggered local action or conversation submission.', ['label', 'action', 'variant'], { label: text, action, variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).default('primary') }),
  Input: component('inputs', 'Bound text input.', ['label', 'bind', 'value', 'placeholder', 'hint'], { label: text, bind: name, value: text.default(''), placeholder: optionalText, hint: optionalText }),
  NumberInput: component('inputs', 'Bound numeric input with optional range and unit.', ['label', 'bind', 'value', 'min', 'max', 'step', 'unit'], { label: text, bind: name, value: number.default(0), min: number.nullish(), max: number.nullish(), step: number.positive().nullish(), unit: optionalText }),
  Counter: component('inputs', 'Large centered numeric parameter with round decrease/increase controls.', ['label', 'bind', 'value', 'min', 'max', 'step', 'unit'], { label: text, bind: name, value: number.default(1), min: number.default(0), max: number.default(1000), step: number.positive().default(1), unit: optionalText }),
  Select: component('inputs', 'Native keyboard-accessible bound select.', ['label', 'bind', 'options', 'value', 'hint'], { label: text, bind: name, options, value: scalar.optional(), hint: optionalText }),
  Slider: component('inputs', 'Bound range slider with visible numeric value.', ['label', 'bind', 'value', 'min', 'max', 'step', 'unit'], { label: text, bind: name, value: number.default(0), min: number.default(0), max: number.default(100), step: number.positive().default(1), unit: optionalText }),
  Checkbox: component('inputs', 'Bound checkbox.', ['label', 'bind', 'value', 'hint'], { label: text, bind: name, value: z.boolean().default(false), hint: optionalText }),
  Checklist: component('inputs', 'A bound list of checked item IDs and completion count.', ['items', 'bind', 'title'], { items: z.array(z.union([text, z.object({ id: text.max(128), label: text, detail: optionalText }).strict()])).max(200), bind: name, title: optionalText }),
  Form: component('inputs', 'Validated form; only explicit submit sends selected values to the conversation.', ['title', 'fields', 'children', 'submitText', 'message'], { title: optionalText, fields, children: children.default([]), submitText: text.default('提交'), message: text.default('请根据这些选择继续。') }, 'children'),
  Tabs: component('layout', 'Keyboard-accessible bound tabs, one child per tab.', ['tabs', 'children', 'bind', 'value'], { tabs: z.array(z.union([text, z.object({ label: text, value: text.max(128) }).strict()])).min(1).max(20), children, bind: name, value: optionalText }, 'children'),
  Calculator: component('interactive', 'Parameter-driven calculation using bounded formulas, with optional additional results.', ['fields', 'formula', 'title', 'resultLabel', 'unit', 'precision', 'results'], { fields, formula, title: optionalText, resultLabel: text.default('计算结果'), unit: optionalText, precision: z.number().int().min(0).max(10).default(2), results: z.array(metric).max(20).optional() }),
  Diagram: component('interactive', 'Interactive labeled graph; selecting a node displays its details.', ['nodes', 'edges', 'title', 'bind'], {
    nodes: z.array(z.object({ id: text.max(128), label: text, detail: optionalText, x: number.optional(), y: number.optional(), tone: tone.optional() }).strict()).max(100),
    edges: z.array(z.object({ from: text.max(128), to: text.max(128), label: optionalText }).strict()).max(200), title: optionalText, bind,
  }),
  Scene: component('interactive', 'General bounded scene with SVG drawing and semantic action cards. Click, key and drag events update local state through safe formulas; playback is explicit and pauses while hidden.', ['scene', 'bind', 'title'], { scene: sceneSchema, bind: name, title: optionalText }),
  Simulation: component('interactive', 'General scene simulation with parameter controls and calculated metrics.', ['scene', 'bind', 'title', 'fields', 'metrics'], { scene: sceneSchema, bind: name, title: optionalText, fields: fields.default([]), metrics: z.array(metric).max(20).default([]) }),
  Game: component('interactive', 'General scene game using click, key or drag rules and deterministic bounded state, with optional parameter controls and live score or progress metrics.', ['scene', 'bind', 'title', 'instructions', 'fields', 'metrics'], { scene: sceneSchema, bind: name, title: optionalText, instructions: optionalText, fields: fields.default([]), metrics: z.array(metric).max(20).default([]) }),
};

export const examples = [
  'root = Stack([Heading("周末小计划"), Text("从最重要的三件事开始。"), Checklist([{id:"walk",label:"散步 30 分钟",detail:"午后去公园"},{id:"cook",label:"准备晚餐"},{id:"read",label:"阅读 20 页"}],"weekend","今天"), Row([Badge("轻松节奏","success"),Button("重新开始",{type:"reset",name:"weekend"},"ghost")])])',
  'root = Grid([Card([Metric("每月预算",4800,"元","已包含生活与娱乐支出"),Chart("bar",[{name:"房租",amount:2200},{name:"餐饮",amount:1200},{name:"交通",amount:400},{name:"其他",amount:1000}],"name",["amount"],"预算分配")],"月度概览"),Card([Table([{key:"item",label:"类别"},{key:"amount",label:"金额",align:"right",format:"currency"}],[{item:"房租",amount:2200},{item:"餐饮",amount:1200},{item:"交通",amount:400}],"支出明细")],"支出")],2)',
  'root = Calculator([{name:"bill",label:"账单金额",value:360,min:0,unit:"元"},{name:"people",label:"人数",value:4,min:1,max:100,step:1},{name:"tip",label:"服务费",value:0,min:0,max:100,unit:"%"}],"bill * (1 + tip / 100) / people","一起分账","每人应付","元",2)',
  'root = Calculator([{name:"principal",label:"初始储蓄",value:10000,min:0,unit:"元"},{name:"rate",label:"年收益率",value:3,min:0,max:30,unit:"%"},{name:"years",label:"年数",value:5,min:1,max:50,step:1}],"principal * pow(1 + rate / 100, years)","复利计算","期末金额","元",2,[{label:"预期收益",formula:"principal * pow(1 + rate / 100, years) - principal",unit:"元"}])',
  'root = Form("为你安排出行",[{name:"destination",label:"目的地",type:"text",value:"杭州",required:true},{name:"days",label:"天数",type:"number",value:3,min:1,max:30,required:true},{name:"pace",label:"旅行节奏",type:"select",options:[{label:"轻松",value:"relaxed"},{label:"充实",value:"active"}],value:"relaxed"}],[Text("提交后会根据你的选择继续规划。","neutral","sm")],"生成行程","请根据出行表单规划行程。")',
  'root = Tabs(["对比","趋势"],[Table(["方案","月费","容量"],[["轻量",29,"100 GB"],["标准",59,"500 GB"],["专业",99,"2 TB"]],"方案对比"),Chart("line",[{month:"一月",a:18,b:12},{month:"二月",a:24,b:22},{month:"三月",a:31,b:28},{month:"四月",a:38,b:35}],"month",[{key:"a",label:"方案 A"},{key:"b",label:"方案 B"}],"使用趋势")],"compare")',
  'root = Diagram([{id:"sun",label:"太阳光",detail:"光提供能量。",x:100,y:120},{id:"leaf",label:"叶绿体",detail:"将光能转化为化学能。",x:300,y:120},{id:"sugar",label:"葡萄糖",detail:"储存能量，并用于生长。",x:500,y:120}],[{from:"sun",to:"leaf",label:"吸收"},{from:"leaf",to:"sugar",label:"合成"}],"光合作用","photosynthesis")',
  'root = Simulation({initial:{x:50,v:45},seed:1,events:{tick:[{name:"x",value:"mod(x + v * event.dt, 560)"}],reset:[{name:"x",value:"50"}]},marks:[{id:"track",type:"line",x:20,y:100,x2:580,y2:100,stroke:"gray"},{id:"ball",type:"circle",x:{expr:"x + 20"},y:100,r:16,fill:"blue",label:"小球"}],width:600,height:200},"motion","匀速运动",[{name:"v",label:"速度",type:"slider",value:45,min:0,max:120,step:1,unit:"px/s"}],[{label:"位置",formula:"x",unit:"px",precision:1}])',
  `root = Game({
  initial:{target:0,score:0,attempts:0,last:"",correct:false},seed:7,
  events:{
    click:[{name:"correct",value:"(event.id == 'spring' && target == 0) || (event.id == 'summer' && target == 1) || (event.id == 'winter' && target == 2)"},{name:"score",value:"correct ? min(5, score + 1) : score"},{name:"attempts",value:"attempts + 1"},{name:"last",value:"event.id"},{name:"target",value:"correct && score < 5 ? floor(rand() * 3) : target"}],
    reset:[{name:"target",value:"0"}]
  },
  actions:[{id:"spring",label:"春天",detail:"新芽与生长",symbol:"🌱",color:"green",shortcut:"1",selected:{expr:"last == 'spring'"},disabled:{expr:"score >= 5"}},{id:"summer",label:"夏天",detail:"阳光与热浪",symbol:"☀",color:"orange",shortcut:"2",selected:{expr:"last == 'summer'"},disabled:{expr:"score >= 5"}},{id:"winter",label:"冬天",detail:"冰雪与寒冷",symbol:"❄",color:"blue",shortcut:"3",selected:{expr:"last == 'winter'"},disabled:{expr:"score >= 5"}}],
  marks:[]
},"seasonMatch","季节配对","根据提示选择季节。点击操作卡，或聚焦后按 1/2/3；匹配正确得 1 分，达到 5 分完成，重置可重新开始。",[],[{label:"提示",formula:"target == 0 ? '万物复苏' : target == 1 ? '烈日蝉鸣' : '冰雪纷飞'"},{label:"得分",formula:"score",precision:0},{label:"进度",formula:"concat(score, ' / 5')"},{label:"尝试次数",formula:"attempts",precision:0},{label:"反馈",formula:"score >= 5 ? '挑战完成' : last == '' ? '请选择与提示相符的季节' : correct ? '匹配正确，继续下一题' : '暂未匹配，再试一次'"}])`,
  'root = Stack([Image("https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1000","山林中的两只鹿","森林生态观察","wide"),Heading("给自然留一点时间"),Text("放慢脚步，观察一处自然环境。记录温度、植物与动物的变化。"),Grid([Card([Input("观察地点","place","附近公园"),Slider("观察时长","minutes",20,5,60,5,"分钟"),Checkbox("准备好记录本","notebook",false)],"开始之前"),Card([NumberInput("气温","temperature",22,-20,50,1,"°C"),Select("天气","weather",["晴","多云","雨"],"晴"),Button("整理观察记录",{type:"submit",text:"请整理我的自然观察记录。",fields:["place","minutes","temperature","weather"]})],"记录")],2),Divider(),Text("图片来自 Unsplash 公共资源。","neutral","sm")])',
  '$people = 5\nroot = Stack([Heading("周末烧烤需要准备多少？"),Text("按每人 400 克主菜、300 克蔬菜估算，调整人数查看采购量。"),Grid([Card([Counter("用餐人数","people",5,1,30,1,"人"),Facts([{label:"主菜总量",value:round($people * 0.4,1),unit:"kg"},{label:"蔬菜总量",value:$people * 300,unit:"g"}])]),Card([Facts([{label:"羊肉",value:round($people * 0.4,1),unit:"kg"},{label:"土豆",value:$people * 300,unit:"g"},{label:"饮用水",value:round($people * 0.6,1),unit:"L"}])],"采购清单", "数量按食量适中估算。")],2)])',
  'root = Card([Heading("一起分账"),Calculator([{name:"total",label:"账单金额",value:288,min:0,unit:"元"},{name:"diners",label:"用餐人数",value:4,min:1,max:30,step:1}],"total / diners",null,"每人应付","元",2),Text("把结果分享给朋友，或继续调整账单。","neutral","sm")],null,null,"paper")',
  `root = Scene({
  initial:{x:120,y:90,held:false},
  events:{
    drag:[{name:"x",value:"event.phase == 'move' ? clamp(x + event.dx, 18, 282) : x"},{name:"y",value:"event.phase == 'move' ? clamp(y + event.dy, 18, 162) : y"},{name:"held",value:"event.phase == 'start' || event.phase == 'move'"}],
    key:[{name:"x",value:"clamp(x + (event.key == 'ArrowRight' ? 10 : event.key == 'ArrowLeft' ? -10 : 0), 18, 282)"},{name:"y",value:"clamp(y + (event.key == 'ArrowDown' ? 10 : event.key == 'ArrowUp' ? -10 : 0), 18, 162)"}]
  },
  marks:[{id:"ball",type:"circle",x:{expr:"x"},y:{expr:"y"},r:16,fill:{expr:"held ? 'orange' : 'blue'"},interactive:true,label:"拖动圆点，或用方向键移动"}],
  width:300,height:180
},"dragPoint","移动圆点")`,
];
