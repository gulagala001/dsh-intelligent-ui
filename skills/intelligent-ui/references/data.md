# data components

Generated from src/catalog.mjs. Positional argument order is authoritative. JSON schema describes each argument; omit optional trailing arguments.

Metric(label, value, unit, detail, tone) — A headline value, unit and supporting trend.
Schema: {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"label":{"type":"string","maxLength":16000},"value":{"anyOf":[{"type":"string","maxLength":16000},{"type":"number"},{"type":"boolean"},{"type":"null"}]},"unit":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]},"detail":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]},"tone":{"default":"neutral","type":"string","enum":["neutral","info","success","warning","danger"]}},"required":["label","value","tone"],"additionalProperties":false}

Facts(items, title) — Compact divided definition rows, with labels and emphasized values. Values can be computed by OpenUI expressions.
Schema: {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"items":{"maxItems":100,"type":"array","items":{"type":"object","properties":{"label":{"type":"string","maxLength":16000},"value":{"anyOf":[{"type":"string","maxLength":16000},{"type":"number"},{"type":"boolean"},{"type":"null"}]},"unit":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]},"detail":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]}},"required":["label","value"],"additionalProperties":false}},"title":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]}},"required":["items"],"additionalProperties":false}

Table(columns, rows, caption, bind) — Scrollable data table with client-side sorting and optional selection.
Schema: {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"columns":{"minItems":1,"maxItems":30,"type":"array","items":{"anyOf":[{"type":"string","maxLength":16000},{"type":"object","properties":{"key":{"type":"string","maxLength":128},"label":{"type":"string","maxLength":16000},"align":{"type":"string","enum":["left","right","center"]},"format":{"type":"string","enum":["text","number","percent","currency"]}},"required":["key","label"],"additionalProperties":false}]}},"rows":{"maxItems":1000,"type":"array","items":{"anyOf":[{"type":"object","propertyNames":{"type":"string","maxLength":128},"additionalProperties":{"anyOf":[{"type":"string","maxLength":16000},{"type":"number"},{"type":"boolean"},{"type":"null"}]}},{"maxItems":30,"type":"array","items":{"anyOf":[{"type":"string","maxLength":16000},{"type":"number"},{"type":"boolean"},{"type":"null"}]}}]}},"caption":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]},"bind":{"type":"string","pattern":"^[A-Za-z_][A-Za-z0-9_]{0,63}$"}},"required":["columns","rows"],"additionalProperties":false}

Chart(type, data, x, series, title, bind) — Interactive SVG line, area, bar, scatter or pie chart with accessible data table.
Schema: {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"type":{"default":"line","type":"string","enum":["line","area","bar","scatter","pie"]},"data":{"maxItems":1000,"type":"array","items":{"type":"object","propertyNames":{"type":"string","maxLength":128},"additionalProperties":{"anyOf":[{"type":"string","maxLength":16000},{"type":"number"},{"type":"boolean"},{"type":"null"}]}}},"x":{"type":"string","maxLength":128},"series":{"minItems":1,"maxItems":12,"type":"array","items":{"anyOf":[{"type":"string","maxLength":128},{"type":"object","properties":{"key":{"type":"string","maxLength":128},"label":{"type":"string","maxLength":16000},"color":{"type":"string","enum":["blue","green","orange","purple","red","gray"]}},"required":["key","label"],"additionalProperties":false}]}},"title":{"anyOf":[{"type":"string","maxLength":16000},{"type":"null"}]},"bind":{"type":"string","pattern":"^[A-Za-z_][A-Za-z0-9_]{0,63}$"}},"required":["type","data","x","series"],"additionalProperties":false}

## Examples

```openui
root = Grid([Card([Metric("每月预算",4800,"元","已包含生活与娱乐支出"),Chart("bar",[{name:"房租",amount:2200},{name:"餐饮",amount:1200},{name:"交通",amount:400},{name:"其他",amount:1000}],"name",["amount"],"预算分配")],"月度概览"),Card([Table([{key:"item",label:"类别"},{key:"amount",label:"金额",align:"right",format:"currency"}],[{item:"房租",amount:2200},{item:"餐饮",amount:1200},{item:"交通",amount:400}],"支出明细")],"支出")],2)
```

```openui
root = Tabs(["对比","趋势"],[Table(["方案","月费","容量"],[["轻量",29,"100 GB"],["标准",59,"500 GB"],["专业",99,"2 TB"]],"方案对比"),Chart("line",[{month:"一月",a:18,b:12},{month:"二月",a:24,b:22},{month:"三月",a:31,b:28},{month:"四月",a:38,b:35}],"month",[{key:"a",label:"方案 A"},{key:"b",label:"方案 B"}],"使用趋势")],"compare")
```

```openui
$people = 5
root = Stack([Heading("周末烧烤需要准备多少？"),Text("按每人 400 克主菜、300 克蔬菜估算，调整人数查看采购量。"),Grid([Card([Counter("用餐人数","people",5,1,30,1,"人"),Facts([{label:"主菜总量",value:round($people * 0.4,1),unit:"kg"},{label:"蔬菜总量",value:$people * 300,unit:"g"}])]),Card([Facts([{label:"羊肉",value:round($people * 0.4,1),unit:"kg"},{label:"土豆",value:$people * 300,unit:"g"},{label:"饮用水",value:round($people * 0.6,1),unit:"L"}])],"采购清单", "数量按食量适中估算。")],2)])
```
