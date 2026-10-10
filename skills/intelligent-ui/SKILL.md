---
name: intelligent-ui
description: Create interactive answers, calculators, diagrams, simulations and games inside the conversation.
---

Use an interactive answer when the user benefits from changing inputs, checking a list, comparing data, exploring a process or playing a small game. Keep a direct written answer when that serves the request better. Write visible labels in the user's language.

Place each interface in an `openui` fenced block, mixed with ordinary Markdown as needed. Assign one root, for example:

```openui
root = Stack([Heading("Packing checklist"), Checkbox("Passport", "passport", false), Checkbox("Charger", "charger", false)])
```

OpenUI is a declarative language, not JavaScript. Use `root = Component(arguments)`, arrays, objects, scalars and optional named data assignments. Component names and positional argument order are case-sensitive. Optional gap uses none/xs/sm/md/lg, or a number of pixels from 0 to 48; omit it for standard spacing. An optional `// iui:1` first line records the protocol. Emit one valid complete document per fence; never wrap it in HTML or an iframe. Do not invent components or positional fields. Use a small number of focused controls and label each control clearly.

`bind` names identify local state. Give distinct controls distinct names unless they intentionally share a value. Initial `value` is a default, not an instruction to overwrite the user's edits. Local input changes do not send a message or call a model. Calculator formulas are quoted strings over field names, e.g. `"bill / people"`; fields are objects with `name`, `label`, `type`, `value`, and optional `min`, `max`, `step`, `unit`. Use only the bounded expression functions documented in references. Formula strings are never JavaScript.

```openui
root = Calculator([{name:"bill",label:"Bill",type:"number",value:120,min:0},{name:"people",label:"People",type:"number",value:3,min:1,max:100,step:1}],"bill / people","Split a bill","Per person","",2)
```

Only an explicit user click on a submit action or form can continue the conversation. A Button action is JSON data: `{type:"set",name:"field",value:123}`, `{type:"reset",name:"field"}`, or `{type:"submit",text:"Continue with these choices",fields:["field"]}`. Never include arbitrary code, automatic submission, network requests, tool calls, file access, credentials or host objects in a document. Unknown or invalid content displays an error and preserves the source; do not promise silent automatic repair.

For composing an answer, the installed catalog and reference files define the supported interface. Use these contracts to compose the answer inside the conversation. Do not inspect plugin implementation files to produce an interactive answer; inspect them when the user asks to debug or extend the plugin. Do not create an application on disk merely to answer an interactive question.

The installed base catalog below is sufficient without file-reading tools. For other components, use an already available filesystem read tool to load only the relevant file relative to this skill's resource base:

- `references/layout.md`: layouts, tabs, grouped content.
- `references/content.md`: text, images, badges and headings.
- `references/data.md`: metrics, tables and interactive charts.
- `references/inputs.md`: controls, actions, checklists and validated forms.
- `references/scenes.md`: scene, simulation and game signatures, local controls, feedback and working examples.
- `references/interactive.md`: calculators, diagrams and complete interactive component schemas.
- `references/expressions.md`: safe formula syntax, events and scene rules.

Reference reading is optional. If it is unavailable, remain within the installed base catalog and ordinary text. Images require public HTTPS URLs without credentials; use meaningful alternative text and cite factual sources in ordinary Markdown. Do not fetch private URLs or encode executable content as an image.
