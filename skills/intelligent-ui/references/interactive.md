# interactive components

Generated from src/catalog.mjs. Positional argument order and allowed enum values are authoritative. Omit optional gap for standard spacing; numeric gap is pixels from 0 to 48. Read signatures and examples first. For Scene/Game events and drawing, read expressions.md. Detailed schemas are below; use native paging or search for a specific component when needed.

## Signatures

Calculator(fields: object[] (max 100), formula: string, title?: string|null, resultLabel: string = "计算结果", unit?: string|null, precision: integer = 2 <= 10 >= 0, results?: object[] (max 20)) — Parameter-driven calculation using bounded formulas, with optional additional results.
Diagram(nodes: object[] (max 100), edges: object[] (max 200), title?: string|null, bind?: string) — Interactive labeled graph; selecting a node displays its details.
Scene(scene: object, bind: string, title?: string|null) — General bounded SVG scene. Events update local state through safe formulas; playback is explicit and pauses while hidden.
Simulation(scene: object, bind: string, title?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene simulation with parameter controls and calculated metrics.
Game(scene: object, bind: string, title?: string|null, instructions?: string|null) — General scene game using click/key rules and deterministic bounded state.

## Examples

```openui
root = Calculator([{name:"bill",label:"账单金额",value:360,min:0,unit:"元"},{name:"people",label:"人数",value:4,min:1,max:100,step:1},{name:"tip",label:"服务费",value:0,min:0,max:100,unit:"%"}],"bill * (1 + tip / 100) / people","一起分账","每人应付","元",2)
```

```openui
root = Diagram([{id:"sun",label:"太阳光",detail:"光提供能量。",x:100,y:120},{id:"leaf",label:"叶绿体",detail:"将光能转化为化学能。",x:300,y:120},{id:"sugar",label:"葡萄糖",detail:"储存能量，并用于生长。",x:500,y:120}],[{from:"sun",to:"leaf",label:"吸收"},{from:"leaf",to:"sugar",label:"合成"}],"光合作用","photosynthesis")
```

```openui
root = Simulation({initial:{x:50,v:45},seed:1,events:{tick:[{name:"x",value:"mod(x + v * event.dt, 560)"}],reset:[{name:"x",value:"50"}]},marks:[{id:"track",type:"line",x:20,y:100,x2:580,y2:100,stroke:"gray"},{id:"ball",type:"circle",x:{expr:"x + 20"},y:100,r:16,fill:"blue",label:"小球"}],width:600,height:200},"motion","匀速运动",[{name:"v",label:"速度",type:"slider",value:45,min:0,max:120,step:1,unit:"px/s"}],[{label:"位置",formula:"x",unit:"px",precision:1}])
```

```openui
root = Game({initial:{score:0,x:80,y:100},seed:7,events:{click:[{name:"score",value:"event.id == 'target' ? score + 1 : score"},{name:"x",value:"event.id == 'target' ? 40 + rand() * 520 : x"},{name:"y",value:"event.id == 'target' ? 40 + rand() * 220 : y"}],key:[{name:"score",value:"event.key == 'Enter' ? score + 1 : score"},{name:"x",value:"event.key == 'Enter' ? 40 + rand() * 520 : x"},{name:"y",value:"event.key == 'Enter' ? 40 + rand() * 220 : y"}]},marks:[{id:"score",type:"text",x:24,y:28,text:{expr:"concat('得分：', score)"},fill:"gray"},{id:"target",type:"circle",x:{expr:"x"},y:{expr:"y"},r:22,fill:"blue",label:"点击目标",interactive:true}],width:600,height:320},"targetGame","点中目标","点击蓝色圆点，或聚焦场景后按 Enter。")
```

## Complete argument schemas

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

Scene(scene: object, bind: string, title?: string|null) — General bounded SVG scene. Events update local state through safe formulas; playback is explicit and pauses while hidden.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "scene": {
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
              "reset"
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
        }
      },
      "required": [
        "initial",
        "events",
        "marks",
        "width",
        "height"
      ],
      "additionalProperties": false
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

Simulation(scene: object, bind: string, title?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene simulation with parameter controls and calculated metrics.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "scene": {
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
              "reset"
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
        }
      },
      "required": [
        "initial",
        "events",
        "marks",
        "width",
        "height"
      ],
      "additionalProperties": false
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

Game(scene: object, bind: string, title?: string|null, instructions?: string|null) — General scene game using click/key rules and deterministic bounded state.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "scene": {
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
              "reset"
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
        }
      },
      "required": [
        "initial",
        "events",
        "marks",
        "width",
        "height"
      ],
      "additionalProperties": false
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
    }
  },
  "required": [
    "scene",
    "bind"
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
