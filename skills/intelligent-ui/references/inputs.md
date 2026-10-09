# inputs components

Generated from src/catalog.mjs. Positional argument order and allowed enum values are authoritative. Omit optional gap for standard spacing; numeric gap is pixels from 0 to 48. Read signatures and examples first. For Scene/Game events and drawing, read expressions.md. Detailed schemas are below; use native paging or search for a specific component when needed.

## Signatures

Button(label: string, action: object|object|object|object|object|object[] (max 30), variant: "primary"|"secondary"|"ghost"|"danger" = "primary") — Explicit user-triggered local action or conversation submission.
Input(label: string, bind: string, value: string = "", placeholder?: string|null, hint?: string|null) — Bound text input.
NumberInput(label: string, bind: string, value: number = 0, min?: number,null, max?: number,null, step?: number|null, unit?: string|null) — Bound numeric input with optional range and unit.
Counter(label: string, bind: string, value: number = 1, min: number = 0, max: number = 1000, step: number = 1, unit?: string|null) — Large centered numeric parameter with round decrease/increase controls.
Select(label: string, bind: string, options: string|number|boolean|null|object[] (max 200), value?: string|number|boolean|null, hint?: string|null) — Native keyboard-accessible bound select.
Slider(label: string, bind: string, value: number = 0, min: number = 0, max: number = 100, step: number = 1, unit?: string|null) — Bound range slider with visible numeric value.
Checkbox(label: string, bind: string, value: boolean = false, hint?: string|null) — Bound checkbox.
Checklist(items: string|object[] (max 200), bind: string, title?: string|null) — A bound list of checked item IDs and completion count.
Form(title?: string|null, fields: object[] (max 100), children: JSON[] (max 500) = [], submitText: string = "提交", message: string = "请根据这些选择继续。") — Validated form; only explicit submit sends selected values to the conversation.

## Examples

```openui
root = Stack([Heading("周末小计划"), Text("从最重要的三件事开始。"), Checklist([{id:"walk",label:"散步 30 分钟",detail:"午后去公园"},{id:"cook",label:"准备晚餐"},{id:"read",label:"阅读 20 页"}],"weekend","今天"), Row([Badge("轻松节奏","success"),Button("重新开始",{type:"reset",name:"weekend"},"ghost")])])
```

```openui
root = Stack([Image("https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1000","山林中的两只鹿","森林生态观察","wide"),Heading("给自然留一点时间"),Text("放慢脚步，观察一处自然环境。记录温度、植物与动物的变化。"),Grid([Card([Input("观察地点","place","附近公园"),Slider("观察时长","minutes",20,5,60,5,"分钟"),Checkbox("准备好记录本","notebook",false)],"开始之前"),Card([NumberInput("气温","temperature",22,-20,50,1,"°C"),Select("天气","weather",["晴","多云","雨"],"晴"),Button("整理观察记录",{type:"submit",text:"请整理我的自然观察记录。",fields:["place","minutes","temperature","weather"]})],"记录")],2),Divider(),Text("图片来自 Unsplash 公共资源。","neutral","sm")])
```

```openui
$people = 5
root = Stack([Heading("周末烧烤需要准备多少？"),Text("按每人 400 克主菜、300 克蔬菜估算，调整人数查看采购量。"),Grid([Card([Counter("用餐人数","people",5,1,30,1,"人"),Facts([{label:"主菜总量",value:round($people * 0.4,1),unit:"kg"},{label:"蔬菜总量",value:$people * 300,unit:"g"}])]),Card([Facts([{label:"羊肉",value:round($people * 0.4,1),unit:"kg"},{label:"土豆",value:$people * 300,unit:"g"},{label:"饮用水",value:round($people * 0.6,1),unit:"L"}])],"采购清单", "数量按食量适中估算。")],2)])
```

```openui
root = Form("为你安排出行",[{name:"destination",label:"目的地",type:"text",value:"杭州",required:true},{name:"days",label:"天数",type:"number",value:3,min:1,max:30,required:true},{name:"pace",label:"旅行节奏",type:"select",options:[{label:"轻松",value:"relaxed"},{label:"充实",value:"active"}],value:"relaxed"}],[Text("提交后会根据你的选择继续规划。","neutral","sm")],"生成行程","请根据出行表单规划行程。")
```

## Complete argument schemas

Button(label: string, action: object|object|object|object|object|object[] (max 30), variant: "primary"|"secondary"|"ghost"|"danger" = "primary") — Explicit user-triggered local action or conversation submission.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "maxLength": 16000
    },
    "action": {
      "anyOf": [
        {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "const": "set"
                },
                "name": {
                  "type": "string",
                  "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
                },
                "value": {
                  "$ref": "#/$defs/__schema0"
                }
              },
              "required": [
                "type",
                "name",
                "value"
              ],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "const": "reset"
                },
                "name": {
                  "type": "string",
                  "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
                }
              },
              "required": [
                "type",
                "name"
              ],
              "additionalProperties": false
            },
            {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "const": "submit"
                },
                "text": {
                  "type": "string",
                  "maxLength": 16000
                },
                "fields": {
                  "maxItems": 100,
                  "type": "array",
                  "items": {
                    "type": "string",
                    "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
                  }
                }
              },
              "required": [
                "type",
                "text"
              ],
              "additionalProperties": false
            }
          ]
        },
        {
          "minItems": 1,
          "maxItems": 30,
          "type": "array",
          "items": {
            "anyOf": [
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "set"
                  },
                  "name": {
                    "type": "string",
                    "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
                  },
                  "value": {
                    "$ref": "#/$defs/__schema0"
                  }
                },
                "required": [
                  "type",
                  "name",
                  "value"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "reset"
                  },
                  "name": {
                    "type": "string",
                    "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
                  }
                },
                "required": [
                  "type",
                  "name"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "type": "string",
                    "const": "submit"
                  },
                  "text": {
                    "type": "string",
                    "maxLength": 16000
                  },
                  "fields": {
                    "maxItems": 100,
                    "type": "array",
                    "items": {
                      "type": "string",
                      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
                    }
                  }
                },
                "required": [
                  "type",
                  "text"
                ],
                "additionalProperties": false
              }
            ]
          }
        }
      ]
    },
    "variant": {
      "default": "primary",
      "type": "string",
      "enum": [
        "primary",
        "secondary",
        "ghost",
        "danger"
      ]
    }
  },
  "required": [
    "label",
    "action",
    "variant"
  ],
  "additionalProperties": false,
  "$defs": {
    "__schema0": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "number"
        },
        {
          "type": "boolean"
        },
        {
          "type": "null"
        },
        {
          "type": "array",
          "items": {
            "$ref": "#/$defs/__schema0"
          }
        },
        {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {
            "$ref": "#/$defs/__schema0"
          }
        }
      ]
    }
  }
}

Input(label: string, bind: string, value: string = "", placeholder?: string|null, hint?: string|null) — Bound text input.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "maxLength": 16000
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
    },
    "value": {
      "default": "",
      "type": "string",
      "maxLength": 16000
    },
    "placeholder": {
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
    "hint": {
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
    "bind",
    "value"
  ],
  "additionalProperties": false
}

NumberInput(label: string, bind: string, value: number = 0, min?: number,null, max?: number,null, step?: number|null, unit?: string|null) — Bound numeric input with optional range and unit.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "maxLength": 16000
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
    },
    "value": {
      "default": 0,
      "type": "number"
    },
    "min": {
      "type": [
        "number",
        "null"
      ]
    },
    "max": {
      "type": [
        "number",
        "null"
      ]
    },
    "step": {
      "anyOf": [
        {
          "type": "number",
          "exclusiveMinimum": 0
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
    }
  },
  "required": [
    "label",
    "bind",
    "value"
  ],
  "additionalProperties": false
}

Counter(label: string, bind: string, value: number = 1, min: number = 0, max: number = 1000, step: number = 1, unit?: string|null) — Large centered numeric parameter with round decrease/increase controls.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "maxLength": 16000
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
    },
    "value": {
      "default": 1,
      "type": "number"
    },
    "min": {
      "default": 0,
      "type": "number"
    },
    "max": {
      "default": 1000,
      "type": "number"
    },
    "step": {
      "default": 1,
      "type": "number",
      "exclusiveMinimum": 0
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
    }
  },
  "required": [
    "label",
    "bind",
    "value",
    "min",
    "max",
    "step"
  ],
  "additionalProperties": false
}

Select(label: string, bind: string, options: string|number|boolean|null|object[] (max 200), value?: string|number|boolean|null, hint?: string|null) — Native keyboard-accessible bound select.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "maxLength": 16000
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
    },
    "options": {
      "maxItems": 200,
      "type": "array",
      "items": {
        "anyOf": [
          {
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
          {
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
              "disabled": {
                "type": "boolean"
              }
            },
            "required": [
              "label",
              "value"
            ],
            "additionalProperties": false
          }
        ]
      }
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
    "hint": {
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
    "bind",
    "options"
  ],
  "additionalProperties": false
}

Slider(label: string, bind: string, value: number = 0, min: number = 0, max: number = 100, step: number = 1, unit?: string|null) — Bound range slider with visible numeric value.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "maxLength": 16000
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
    },
    "value": {
      "default": 0,
      "type": "number"
    },
    "min": {
      "default": 0,
      "type": "number"
    },
    "max": {
      "default": 100,
      "type": "number"
    },
    "step": {
      "default": 1,
      "type": "number",
      "exclusiveMinimum": 0
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
    }
  },
  "required": [
    "label",
    "bind",
    "value",
    "min",
    "max",
    "step"
  ],
  "additionalProperties": false
}

Checkbox(label: string, bind: string, value: boolean = false, hint?: string|null) — Bound checkbox.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "maxLength": 16000
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
    },
    "value": {
      "default": false,
      "type": "boolean"
    },
    "hint": {
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
    "bind",
    "value"
  ],
  "additionalProperties": false
}

Checklist(items: string|object[] (max 200), bind: string, title?: string|null) — A bound list of checked item IDs and completion count.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "items": {
      "maxItems": 200,
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
              "id": {
                "type": "string",
                "maxLength": 128
              },
              "label": {
                "type": "string",
                "maxLength": 16000
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
              "id",
              "label"
            ],
            "additionalProperties": false
          }
        ]
      }
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
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
    "items",
    "bind"
  ],
  "additionalProperties": false
}

Form(title?: string|null, fields: object[] (max 100), children: JSON[] (max 500) = [], submitText: string = "提交", message: string = "请根据这些选择继续。") — Validated form; only explicit submit sends selected values to the conversation.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
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
    "fields": {
      "maxItems": 100,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
          },
          "label": {
            "type": "string",
            "maxLength": 16000
          },
          "type": {
            "default": "number",
            "type": "string",
            "enum": [
              "text",
              "number",
              "select",
              "checkbox",
              "slider",
              "textarea"
            ]
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
          "placeholder": {
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
          "hint": {
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
          "min": {
            "type": [
              "number",
              "null"
            ]
          },
          "max": {
            "type": [
              "number",
              "null"
            ]
          },
          "step": {
            "anyOf": [
              {
                "type": "number",
                "exclusiveMinimum": 0
              },
              {
                "type": "null"
              }
            ]
          },
          "required": {
            "type": "boolean"
          },
          "options": {
            "maxItems": 200,
            "type": "array",
            "items": {
              "anyOf": [
                {
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
                {
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
                    "disabled": {
                      "type": "boolean"
                    }
                  },
                  "required": [
                    "label",
                    "value"
                  ],
                  "additionalProperties": false
                }
              ]
            }
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
          }
        },
        "required": [
          "name",
          "label",
          "type"
        ],
        "additionalProperties": false
      }
    },
    "children": {
      "default": [],
      "maxItems": 500,
      "type": "array",
      "items": {}
    },
    "submitText": {
      "default": "提交",
      "type": "string",
      "maxLength": 16000
    },
    "message": {
      "default": "请根据这些选择继续。",
      "type": "string",
      "maxLength": 16000
    }
  },
  "required": [
    "fields",
    "children",
    "submitText",
    "message"
  ],
  "additionalProperties": false
}
