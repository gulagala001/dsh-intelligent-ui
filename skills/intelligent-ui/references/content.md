# content components

Generated from src/catalog.mjs. Positional argument order and allowed enum values are authoritative. Omit optional gap for standard spacing; numeric gap is pixels from 0 to 48. Read signatures and examples first. For Scene/Game events and drawing, read expressions.md. Detailed schemas are below; use native paging or search for a specific component when needed.

## Signatures

Text(text: string, tone: "neutral"|"info"|"success"|"warning"|"danger" = "neutral", size: "sm"|"md"|"lg" = "md") — Plain text with preserved line breaks. No HTML.
Heading(text: string, level: integer = 2 <= 4 >= 2) — A semantic section heading.
Divider() — A subtle section separator.
Image(src: string, alt: string, caption?: string|null, aspect: "auto"|"wide"|"square"|"portrait" = "auto") — Public HTTPS image with meaningful alternative text.
Badge(text: string, tone: "neutral"|"info"|"success"|"warning"|"danger" = "neutral") — Compact status label.

## Examples

```openui
root = Stack([Heading("周末小计划"), Text("从最重要的三件事开始。"), Checklist([{id:"walk",label:"散步 30 分钟",detail:"午后去公园"},{id:"cook",label:"准备晚餐"},{id:"read",label:"阅读 20 页"}],"weekend","今天"), Row([Badge("轻松节奏","success"),Button("重新开始",{type:"reset",name:"weekend"},"ghost")])])
```

```openui
root = Stack([Image("https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1000","山林中的两只鹿","森林生态观察","wide"),Heading("给自然留一点时间"),Text("放慢脚步，观察一处自然环境。记录温度、植物与动物的变化。"),Grid([Card([Input("观察地点","place","附近公园"),Slider("观察时长","minutes",20,5,60,5,"分钟"),Checkbox("准备好记录本","notebook",false)],"开始之前"),Card([NumberInput("气温","temperature",22,-20,50,1,"°C"),Select("天气","weather",["晴","多云","雨"],"晴"),Button("整理观察记录",{type:"submit",text:"请整理我的自然观察记录。",fields:["place","minutes","temperature","weather"]})],"记录")],2),Divider(),Text("图片来自 Unsplash 公共资源。","neutral","sm")])
```

## Complete argument schemas

Text(text: string, tone: "neutral"|"info"|"success"|"warning"|"danger" = "neutral", size: "sm"|"md"|"lg" = "md") — Plain text with preserved line breaks. No HTML.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "maxLength": 16000
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
    },
    "size": {
      "default": "md",
      "type": "string",
      "enum": [
        "sm",
        "md",
        "lg"
      ]
    }
  },
  "required": [
    "text",
    "tone",
    "size"
  ],
  "additionalProperties": false
}

Heading(text: string, level: integer = 2 <= 4 >= 2) — A semantic section heading.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "maxLength": 16000
    },
    "level": {
      "default": 2,
      "type": "integer",
      "minimum": 2,
      "maximum": 4
    }
  },
  "required": [
    "text",
    "level"
  ],
  "additionalProperties": false
}

Divider() — A subtle section separator.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
  "additionalProperties": false
}

Image(src: string, alt: string, caption?: string|null, aspect: "auto"|"wide"|"square"|"portrait" = "auto") — Public HTTPS image with meaningful alternative text.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "src": {
      "type": "string",
      "maxLength": 2048,
      "format": "uri"
    },
    "alt": {
      "type": "string",
      "maxLength": 16000
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
    "aspect": {
      "default": "auto",
      "type": "string",
      "enum": [
        "auto",
        "wide",
        "square",
        "portrait"
      ]
    }
  },
  "required": [
    "src",
    "alt",
    "aspect"
  ],
  "additionalProperties": false
}

Badge(text: string, tone: "neutral"|"info"|"success"|"warning"|"danger" = "neutral") — Compact status label.
Schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "maxLength": 16000
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
    "text",
    "tone"
  ],
  "additionalProperties": false
}
