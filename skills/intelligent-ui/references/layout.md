# layout components

Generated from src/catalog.mjs. Positional argument order is authoritative. JSON schema describes each argument; omit optional trailing arguments.

Stack(children, gap) — Vertical layout with responsive spacing.
Schema: {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"children":{"maxItems":500,"type":"array","items":{}},"gap":{"default":"md","type":"string","enum":["none","xs","sm","md","lg"]}},"required":["children","gap"],"additionalProperties":false}

Row(children, gap, align) — Wrapping horizontal layout.
Schema: {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"children":{"maxItems":500,"type":"array","items":{}},"gap":{"default":"md","type":"string","enum":["none","xs","sm","md","lg"]},"align":{"default":"center","type":"string","enum":["start","center","end","stretch"]}},"required":["children","gap","align"],"additionalProperties":false}

Grid(children, columns, gap) — Responsive equal-width columns; collapses on narrow screens.
Schema: {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"children":{"maxItems":500,"type":"array","items":{}},"columns":{"default":2,"type":"integer","minimum":1,"maximum":6},"gap":{"default":"md","type":"string","enum":["none","xs","sm","md","lg"]}},"required":["children","columns","gap"],"additionalProperties":false}

Card(children, title, description, variant) — Grouped content with optional title, description and paper treatment.
Schema: {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"children":{"maxItems":500,"type":"array","items":{}},"title":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]},"description":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]},"variant":{"default":"default","type":"string","enum":["default","paper"]}},"required":["children","variant"],"additionalProperties":false}

Tabs(tabs, children, bind, value) — Keyboard-accessible bound tabs, one child per tab.
Schema: {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"tabs":{"minItems":1,"maxItems":20,"type":"array","items":{"anyOf":[{"type":"string","maxLength":16000},{"type":"object","properties":{"label":{"type":"string","maxLength":16000},"value":{"type":"string","maxLength":128}},"required":["label","value"],"additionalProperties":false}]}},"children":{"maxItems":500,"type":"array","items":{}},"bind":{"type":"string","pattern":"^[A-Za-z_][A-Za-z0-9_]{0,63}$"},"value":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]}},"required":["tabs","children","bind"],"additionalProperties":false}

## Examples

```openui
root = Stack([Heading("周末小计划"), Text("从最重要的三件事开始。"), Checklist([{id:"walk",label:"散步 30 分钟",detail:"午后去公园"},{id:"cook",label:"准备晚餐"},{id:"read",label:"阅读 20 页"}],"weekend","今天"), Row([Badge("轻松节奏","success"),Button("重新开始",{type:"reset",name:"weekend"},"ghost")])])
```

```openui
root = Grid([Card([Metric("每月预算",4800,"元","已包含生活与娱乐支出"),Chart("bar",[{name:"房租",amount:2200},{name:"餐饮",amount:1200},{name:"交通",amount:400},{name:"其他",amount:1000}],"name",["amount"],"预算分配")],"月度概览"),Card([Table([{key:"item",label:"类别"},{key:"amount",label:"金额",align:"right",format:"currency"}],[{item:"房租",amount:2200},{item:"餐饮",amount:1200},{item:"交通",amount:400}],"支出明细")],"支出")],2)
```

```openui
root = Tabs(["对比","趋势"],[Table(["方案","月费","容量"],[["轻量",29,"100 GB"],["标准",59,"500 GB"],["专业",99,"2 TB"]],"方案对比"),Chart("line",[{month:"一月",a:18,b:12},{month:"二月",a:24,b:22},{month:"三月",a:31,b:28},{month:"四月",a:38,b:35}],"month",[{key:"a",label:"方案 A"},{key:"b",label:"方案 B"}],"使用趋势")],"compare")
```

```openui
root = Stack([Image("https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1000","山林中的两只鹿","森林生态观察","wide"),Heading("给自然留一点时间"),Text("放慢脚步，观察一处自然环境。记录温度、植物与动物的变化。"),Grid([Card([Input("观察地点","place","附近公园"),Slider("观察时长","minutes",20,5,60,5,"分钟"),Checkbox("准备好记录本","notebook",false)],"开始之前"),Card([NumberInput("气温","temperature",22,-20,50,1,"°C"),Select("天气","weather",["晴","多云","雨"],"晴"),Button("整理观察记录",{type:"submit",text:"请整理我的自然观察记录。",fields:["place","minutes","temperature","weather"]})],"记录")],2),Divider(),Text("图片来自 Unsplash 公共资源。","neutral","sm")])
```
