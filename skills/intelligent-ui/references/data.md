# data components

Generated from src/catalog.mjs. Positional argument order and allowed enum values are authoritative. Omit optional gap for standard spacing; numeric gap is pixels from 0 to 48. Read signatures and examples first. For Scene/Game events and drawing, read expressions.md. Detailed schemas are below; use native paging or search for a specific component when needed.

Chart series objects may specify an explicit unit. For line, area, bar and scatter charts, series with the same unit can be plotted together; different unit groups use the metric selector. Values are shown as supplied; the chart does not convert units. For a requested chart, put the requested primary measure first and include its known unit. Do not place monthly fees and storage capacities on the same comparable axis; add other metrics only when they help answer the request.

Chart accepts categoryFilters (default false) and colorBy ("series" by default, or "category") after bind. Enable categoryFilters to show grouped controls for the x column; equal typed category values filter together. Category colors stay consistent while filtering or reordering the same full category set; the six-color palette repeats, and changing that set may change colors. With colorBy:"category", bar/scatter/pie marks use category colors, and line/area charts use matching point colors and gradients. Filtering changes visible plots, scales and hit targets while the raw data table retains every row and series. Pie charts show one selected metric and already support category filtering; categoryFilters uses the grouped controls. All selectors and filters update only local state.

## Signatures

Metric(label: string, value: string|number|boolean|null, unit?: string|null, detail?: string|null, tone: "neutral"|"info"|"success"|"warning"|"danger" = "neutral") — A headline value, unit and supporting trend.
Facts(items: object[] (max 100), title?: string|null) — Compact divided definition rows, with labels and emphasized values. Values can be computed by OpenUI expressions.
Table(columns: string|object[] (max 30), rows: object|string|number|boolean|null[] (max 30)[] (max 1000), caption?: string|null, bind?: string) — Scrollable data table with client-side sorting and optional selection.
Chart(type: "line"|"area"|"bar"|"scatter"|"pie" = "line", data: object[] (max 1000), x: string, series: string|object[] (max 12), title?: string|null, bind?: string, categoryFilters: boolean = false, colorBy: "series"|"category" = "series") — Interactive SVG line, area, bar, scatter or pie chart with accessible raw data table. Explicit series units keep compatible scales together; optional category filters and category colors support local comparison.

## Examples

```openui
root = Grid([Card([Metric("每月预算",4800,"元","已包含生活与娱乐支出"),Chart("bar",[{name:"房租",amount:2200},{name:"餐饮",amount:1200},{name:"交通",amount:400},{name:"其他",amount:1000}],"name",["amount"],"预算分配")],"月度概览"),Card([Table([{key:"item",label:"类别"},{key:"amount",label:"金额",align:"right",format:"currency"}],[{item:"房租",amount:2200},{item:"餐饮",amount:1200},{item:"交通",amount:400}],"支出明细")],"支出")],2)
```

```openui
$people = 5
root = Stack([Heading("周末烧烤需要准备多少？"),Text("按每人 400 克主菜、300 克蔬菜估算，调整人数查看采购量。"),Grid([Card([Counter("用餐人数","people",5,1,30,1,"人"),Facts([{label:"主菜总量",value:round($people * 0.4,1),unit:"kg"},{label:"蔬菜总量",value:$people * 300,unit:"g"}])]),Card([Facts([{label:"羊肉",value:round($people * 0.4,1),unit:"kg"},{label:"土豆",value:$people * 300,unit:"g"},{label:"饮用水",value:round($people * 0.6,1),unit:"L"}])],"采购清单", "数量按食量适中估算。")],2)])
```

## Complete argument schemas

Metric(label: string, value: string|number|boolean|null, unit?: string|null, detail?: string|null, tone: "neutral"|"info"|"success"|"warning"|"danger" = "neutral") — A headline value, unit and supporting trend.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "maxLength": 16000
    },
    "value": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 16000
        },
        {
          "type": "number"
        },
        {
          "type": "boolean"
        },
        {
          "type": "null"
        }
      ]
    },
    "unit": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 16000
        },
        {
          "type": "null"
        }
      ]
    },
    "detail": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 16000
        },
        {
          "type": "null"
        }
      ]
    },
    "tone": {
      "default": "neutral",
      "type": "string",
      "enum": [
        "neutral",
        "info",
        "success",
        "warning",
        "danger"
      ]
    }
  },
  "required": [
    "label",
    "value",
    "tone"
  ],
  "additionalProperties": false
}

Facts(items: object[] (max 100), title?: string|null) — Compact divided definition rows, with labels and emphasized values. Values can be computed by OpenUI expressions.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "items": {
      "maxItems": 100,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": {
            "type": "string",
            "maxLength": 16000
          },
          "value": {
            "anyOf": [
              {
                "type": "string",
                "maxLength": 16000
              },
              {
                "type": "number"
              },
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ]
          },
          "unit": {
            "anyOf": [
              {
                "type": "string",
                "maxLength": 16000
              },
              {
                "type": "null"
              }
            ]
          },
          "detail": {
            "anyOf": [
              {
                "type": "string",
                "maxLength": 16000
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "label",
          "value"
        ],
        "additionalProperties": false
      }
    },
    "title": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 16000
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "items"
  ],
  "additionalProperties": false
}

Table(columns: string|object[] (max 30), rows: object|string|number|boolean|null[] (max 30)[] (max 1000), caption?: string|null, bind?: string) — Scrollable data table with client-side sorting and optional selection.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "columns": {
      "minItems": 1,
      "maxItems": 30,
      "type": "array",
      "items": {
        "anyOf": [
          {
            "type": "string",
            "maxLength": 16000
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "maxLength": 128
              },
              "label": {
                "type": "string",
                "maxLength": 16000
              },
              "align": {
                "type": "string",
                "enum": [
                  "left",
                  "right",
                  "center"
                ]
              },
              "format": {
                "type": "string",
                "enum": [
                  "text",
                  "number",
                  "percent",
                  "currency"
                ]
              }
            },
            "required": [
              "key",
              "label"
            ],
            "additionalProperties": false
          }
        ]
      }
    },
    "rows": {
      "maxItems": 1000,
      "type": "array",
      "items": {
        "anyOf": [
          {
            "type": "object",
            "propertyNames": {
              "type": "string",
              "maxLength": 128
            },
            "additionalProperties": {
              "anyOf": [
                {
                  "type": "string",
                  "maxLength": 16000
                },
                {
                  "type": "number"
                },
                {
                  "type": "boolean"
                },
                {
                  "type": "null"
                }
              ]
            }
          },
          {
            "maxItems": 30,
            "type": "array",
            "items": {
              "anyOf": [
                {
                  "type": "string",
                  "maxLength": 16000
                },
                {
                  "type": "number"
                },
                {
                  "type": "boolean"
                },
                {
                  "type": "null"
                }
              ]
            }
          }
        ]
      }
    },
    "caption": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 16000
        },
        {
          "type": "null"
        }
      ]
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
    }
  },
  "required": [
    "columns",
    "rows"
  ],
  "additionalProperties": false
}

Chart(type: "line"|"area"|"bar"|"scatter"|"pie" = "line", data: object[] (max 1000), x: string, series: string|object[] (max 12), title?: string|null, bind?: string, categoryFilters: boolean = false, colorBy: "series"|"category" = "series") — Interactive SVG line, area, bar, scatter or pie chart with accessible raw data table. Explicit series units keep compatible scales together; optional category filters and category colors support local comparison.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "default": "line",
      "type": "string",
      "enum": [
        "line",
        "area",
        "bar",
        "scatter",
        "pie"
      ]
    },
    "data": {
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "propertyNames": {
          "type": "string",
          "maxLength": 128
        },
        "additionalProperties": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 16000
            },
            {
              "type": "number"
            },
            {
              "type": "boolean"
            },
            {
              "type": "null"
            }
          ]
        }
      }
    },
    "x": {
      "type": "string",
      "maxLength": 128
    },
    "series": {
      "minItems": 1,
      "maxItems": 12,
      "type": "array",
      "items": {
        "anyOf": [
          {
            "type": "string",
            "maxLength": 128
          },
          {
            "type": "object",
            "properties": {
              "key": {
                "type": "string",
                "maxLength": 128
              },
              "label": {
                "type": "string",
                "maxLength": 16000
              },
              "color": {
                "type": "string",
                "enum": [
                  "blue",
                  "green",
                  "orange",
                  "purple",
                  "red",
                  "gray"
                ]
              },
              "unit": {
                "type": "string",
                "maxLength": 40
              }
            },
            "required": [
              "key",
              "label"
            ],
            "additionalProperties": false
          }
        ]
      }
    },
    "title": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 16000
        },
        {
          "type": "null"
        }
      ]
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
    },
    "categoryFilters": {
      "default": false,
      "type": "boolean"
    },
    "colorBy": {
      "default": "series",
      "type": "string",
      "enum": [
        "series",
        "category"
      ]
    }
  },
  "required": [
    "type",
    "data",
    "x",
    "series",
    "categoryFilters",
    "colorBy"
  ],
  "additionalProperties": false
}
