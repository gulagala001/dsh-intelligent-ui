# interactive components

Generated from src/catalog.mjs. Positional argument order and allowed enum values are authoritative. Omit optional gap for standard spacing; numeric gap is pixels from 0 to 48. Read signatures and examples first. For Scene/Game events and drawing, read expressions.md. Detailed schemas are below; use native paging or search for a specific component when needed.

## Signatures

Calculator(fields: object[] (max 100), formula: string, title?: string|null, resultLabel: string = "计算结果", unit?: string|null, precision: integer = 2 <= 10 >= 0, results?: object[] (max 20)) — Parameter-driven calculation using bounded formulas, with optional additional results.
Diagram(nodes: object[] (max 100), edges: object[] (max 200), title?: string|null, bind?: string) — Interactive labeled graph; selecting a node displays its details.
Scene(scene: object, bind: string, title?: string|null) — General bounded scene with SVG drawing and semantic action cards. Click, key and drag events update local state through safe formulas; playback is explicit and pauses while hidden.
Simulation(scene: object, bind: string, title?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene simulation with parameter controls and calculated metrics.
Game(scene: object, bind: string, title?: string|null, instructions?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene game using click, key or drag rules and deterministic bounded state, with optional parameter controls and live score or progress metrics.

## Examples

```openui
root = Calculator([{name:"bill",label:"账单金额",value:360,min:0,unit:"元"},{name:"people",label:"人数",value:4,min:1,max:100,step:1},{name:"tip",label:"服务费",value:0,min:0,max:100,unit:"%"}],"bill * (1 + tip / 100) / people","一起分账","每人应付","元",2)
```

```openui
root = Diagram([{id:"sun",label:"太阳光",detail:"光提供能量。",x:100,y:120},{id:"leaf",label:"叶绿体",detail:"将光能转化为化学能。",x:300,y:120},{id:"sugar",label:"葡萄糖",detail:"储存能量，并用于生长。",x:500,y:120}],[{from:"sun",to:"leaf",label:"吸收"},{from:"leaf",to:"sugar",label:"合成"}],"光合作用","photosynthesis")
```

```openui
root = Scene({
  initial:{x:120,y:90,held:false},
  events:{
    drag:[{name:"x",value:"event.phase == 'move' ? clamp(x + event.dx, 18, 282) : x"},{name:"y",value:"event.phase == 'move' ? clamp(y + event.dy, 18, 162) : y"},{name:"held",value:"event.phase == 'start' || event.phase == 'move'"}],
    key:[{name:"x",value:"clamp(x + (event.key == 'ArrowRight' ? 10 : event.key == 'ArrowLeft' ? -10 : 0), 18, 282)"},{name:"y",value:"clamp(y + (event.key == 'ArrowDown' ? 10 : event.key == 'ArrowUp' ? -10 : 0), 18, 162)"}]
  },
  marks:[{id:"ball",type:"circle",x:{expr:"x"},y:{expr:"y"},r:16,fill:{expr:"held ? 'orange' : 'blue'"},interactive:true,label:"拖动圆点，或用方向键移动"}],
  width:300,height:180
},"dragPoint","移动圆点")
```

```openui
root = Simulation({initial:{x:50,v:45},seed:1,events:{tick:[{name:"x",value:"mod(x + v * event.dt, 560)"}],reset:[{name:"x",value:"50"}]},marks:[{id:"track",type:"line",x:20,y:100,x2:580,y2:100,stroke:"gray"},{id:"ball",type:"circle",x:{expr:"x + 20"},y:100,r:16,fill:"blue",label:"小球"}],width:600,height:200},"motion","匀速运动",[{name:"v",label:"速度",type:"slider",value:45,min:0,max:120,step:1,unit:"px/s"}],[{label:"位置",formula:"x",unit:"px",precision:1}])
```

```openui
root = Game({
  initial:{target:0,score:0,attempts:0,last:"",correct:false},seed:7,
  events:{
    click:[{name:"correct",value:"(event.id == 'spring' && target == 0) || (event.id == 'summer' && target == 1) || (event.id == 'winter' && target == 2)"},{name:"score",value:"correct ? min(5, score + 1) : score"},{name:"attempts",value:"attempts + 1"},{name:"last",value:"event.id"},{name:"target",value:"correct && score < 5 ? floor(rand() * 3) : target"}],
    reset:[{name:"target",value:"0"}]
  },
  actions:[{id:"spring",label:"春天",detail:"新芽与生长",symbol:"🌱",color:"green",shortcut:"1",selected:{expr:"last == 'spring'"},disabled:{expr:"score >= 5"}},{id:"summer",label:"夏天",detail:"阳光与热浪",symbol:"☀",color:"orange",shortcut:"2",selected:{expr:"last == 'summer'"},disabled:{expr:"score >= 5"}},{id:"winter",label:"冬天",detail:"冰雪与寒冷",symbol:"❄",color:"blue",shortcut:"3",selected:{expr:"last == 'winter'"},disabled:{expr:"score >= 5"}}],
  marks:[]
},"seasonMatch","季节配对","根据提示选择季节。点击操作卡，或聚焦后按 1/2/3；匹配正确得 1 分，达到 5 分完成，重置可重新开始。",[],[{label:"提示",formula:"target == 0 ? '万物复苏' : target == 1 ? '烈日蝉鸣' : '冰雪纷飞'"},{label:"得分",formula:"score",precision:0},{label:"进度",formula:"concat(score, ' / 5')"},{label:"尝试次数",formula:"attempts",precision:0},{label:"反馈",formula:"score >= 5 ? '挑战完成' : last == '' ? '请选择与提示相符的季节' : correct ? '匹配正确，继续下一题' : '暂未匹配，再试一次'"}])
```

## Complete argument schemas

## Shared Scene argument schema

The JSON Schema resource below is generated from sceneSchema in src/catalog.mjs. Its $id is "iui:scene"; the Scene, Simulation and Game argument schemas resolve their scene $ref to this resource. Local #/$defs/ references resolve within this resource. All other component arguments remain defined inline.

Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "initial": {
      "type": "object",
      "propertyNames": {
        "type": "string",
        "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
      },
      "additionalProperties": {
        "$ref": "#/$defs/__schema0"
      }
    },
    "seed": {
      "type": "integer",
      "minimum": 0,
      "maximum": 4294967295
    },
    "events": {
      "type": "object",
      "propertyNames": {
        "type": "string",
        "enum": [
          "click",
          "key",
          "tick",
          "reset",
          "drag"
        ]
      },
      "additionalProperties": {
        "maxItems": 100,
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
            },
            "value": {
              "type": "string",
              "maxLength": 4000
            }
          },
          "required": [
            "name",
            "value"
          ],
          "additionalProperties": false
        }
      }
    },
    "marks": {
      "maxItems": 1000,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "maxLength": 128
          },
          "type": {
            "type": "string",
            "enum": [
              "circle",
              "rect",
              "line",
              "text",
              "path"
            ]
          },
          "x": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "y": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "x2": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "y2": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "width": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "height": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "r": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "text": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "fill": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "stroke": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "strokeWidth": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "opacity": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "fontSize": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "points": {
            "anyOf": [
              {
                "maxItems": 1000,
                "type": "array",
                "items": {
                  "minItems": 2,
                  "maxItems": 2,
                  "type": "array",
                  "items": {
                    "type": "number"
                  }
                }
              },
              {
                "type": "object",
                "properties": {
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "label": {
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
          "interactive": {
            "type": "boolean"
          }
        },
        "required": [
          "id",
          "type"
        ],
        "additionalProperties": false
      }
    },
    "width": {
      "default": 600,
      "type": "number",
      "exclusiveMinimum": 0,
      "maximum": 2000
    },
    "height": {
      "default": 320,
      "type": "number",
      "exclusiveMinimum": 0,
      "maximum": 2000
    },
    "actions": {
      "default": [],
      "maxItems": 32,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "maxLength": 128
          },
          "label": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "detail": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "symbol": {
            "anyOf": [
              {
                "type": "string",
                "maxLength": 16
              },
              {
                "type": "object",
                "properties": {
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "selected": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "object",
                "properties": {
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "disabled": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "object",
                "properties": {
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "color": {
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
                  "expr": {
                    "type": "string",
                    "maxLength": 4000
                  }
                },
                "required": [
                  "expr"
                ],
                "additionalProperties": false
              }
            ]
          },
          "shortcut": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1,
            "pattern": "^[A-Za-z0-9]$"
          }
        },
        "required": [
          "id",
          "label"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "initial",
    "events",
    "marks",
    "width",
    "height",
    "actions"
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
  },
  "$id": "iui:scene"
}

## Component argument schemas

Calculator(fields: object[] (max 100), formula: string, title?: string|null, resultLabel: string = "计算结果", unit?: string|null, precision: integer = 2 <= 10 >= 0, results?: object[] (max 20)) — Parameter-driven calculation using bounded formulas, with optional additional results.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
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
    "formula": {
      "type": "string",
      "maxLength": 4000
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
    "resultLabel": {
      "default": "计算结果",
      "type": "string",
      "maxLength": 16000
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
    "precision": {
      "default": 2,
      "type": "integer",
      "minimum": 0,
      "maximum": 10
    },
    "results": {
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": {
            "type": "string",
            "maxLength": 16000
          },
          "formula": {
            "type": "string",
            "maxLength": 4000
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
          "precision": {
            "type": "integer",
            "minimum": 0,
            "maximum": 10
          }
        },
        "required": [
          "label",
          "formula"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "fields",
    "formula",
    "resultLabel",
    "precision"
  ],
  "additionalProperties": false
}

Diagram(nodes: object[] (max 100), edges: object[] (max 200), title?: string|null, bind?: string) — Interactive labeled graph; selecting a node displays its details.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "nodes": {
      "maxItems": 100,
      "type": "array",
      "items": {
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
          },
          "x": {
            "type": "number"
          },
          "y": {
            "type": "number"
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
          "id",
          "label"
        ],
        "additionalProperties": false
      }
    },
    "edges": {
      "maxItems": 200,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "from": {
            "type": "string",
            "maxLength": 128
          },
          "to": {
            "type": "string",
            "maxLength": 128
          },
          "label": {
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
          "from",
          "to"
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
    },
    "bind": {
      "type": "string",
      "pattern": "^[A-Za-z_][A-Za-z0-9_]{0,63}$"
    }
  },
  "required": [
    "nodes",
    "edges"
  ],
  "additionalProperties": false
}

Scene(scene: object, bind: string, title?: string|null) — General bounded scene with SVG drawing and semantic action cards. Click, key and drag events update local state through safe formulas; playback is explicit and pauses while hidden.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "scene": {
      "$ref": "iui:scene"
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
    "scene",
    "bind"
  ],
  "additionalProperties": false
}

Simulation(scene: object, bind: string, title?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene simulation with parameter controls and calculated metrics.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "scene": {
      "$ref": "iui:scene"
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
    },
    "fields": {
      "default": [],
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
    "metrics": {
      "default": [],
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": {
            "type": "string",
            "maxLength": 16000
          },
          "formula": {
            "type": "string",
            "maxLength": 4000
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
          "precision": {
            "type": "integer",
            "minimum": 0,
            "maximum": 10
          }
        },
        "required": [
          "label",
          "formula"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "scene",
    "bind",
    "fields",
    "metrics"
  ],
  "additionalProperties": false
}

Game(scene: object, bind: string, title?: string|null, instructions?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene game using click, key or drag rules and deterministic bounded state, with optional parameter controls and live score or progress metrics.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "scene": {
      "$ref": "iui:scene"
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
    },
    "instructions": {
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
      "default": [],
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
    "metrics": {
      "default": [],
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "label": {
            "type": "string",
            "maxLength": 16000
          },
          "formula": {
            "type": "string",
            "maxLength": 4000
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
          "precision": {
            "type": "integer",
            "minimum": 0,
            "maximum": 10
          }
        },
        "required": [
          "label",
          "formula"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "scene",
    "bind",
    "fields",
    "metrics"
  ],
  "additionalProperties": false
}
