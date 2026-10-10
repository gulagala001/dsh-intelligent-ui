# Scenes, simulations and games

Use these positional signatures and working examples to compose a scene answer. This guide is generated from the installed catalog. The full schemas are in interactive.md; additional formula functions are in expressions.md.

## Signatures

Scene(scene: object, bind: string, title?: string|null) — General bounded SVG scene with click, key and drag interaction. Events update local state through safe formulas; playback is explicit and pauses while hidden.
Simulation(scene: object, bind: string, title?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene simulation with parameter controls and calculated metrics.
Game(scene: object, bind: string, title?: string|null, instructions?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene game using click, key or drag rules and deterministic bounded state, with optional parameter controls and live score or progress metrics.

## Local scene contract

- A scene has required initial, events and marks, plus optional seed, width and height. initial is plain JSON keyed by declared field names (letter/underscore first, then letters/digits/underscores, at most 64 characters). Every event can update only these declared fields. Scene state is private to its bind.
- width defaults to 600, height to 320; both are positive and at most 2000. Use compact dimensions and at most 1000 marks.
- events contains optional `click`, `key`, `tick`, `reset`, `drag` arrays of {name,value}. name identifies a declared field; value is a quoted pure formula. Steps see preceding steps' updated values; the whole event commits atomically. To integrate motion, update position with the current velocity before updating velocity.
- Scalars, arithmetic, comparisons, boolean operators and a ternary conditional work. Common pure functions include min, max, clamp, mod, round, floor, abs and concat. rand() is available only in event transitions and uses the scene seed. Do not write JavaScript, assignments or Math methods in a formula.
- click gives event.id and SVG event.x/event.y. key gives event.key and the focused mark's event.id (or scene). A defined key event receives Enter/Space instead of a synthetic click: provide equivalent rules for the desired keys. tick gives event.dt in seconds, clamped to 0..0.1. Playback starts only with the user's Play action.
- drag requires an interactive mark and events.drag. It gives event.id, event.phase (start/move/end/cancel), SVG event.x/event.y and event.dx/event.dy since the previous delivered event. Use move-only updates to preserve the pick-up offset. Start/end have zero movement; release flushes the final move first. Cancel drops a pending move. Coordinates stay within the scene.
- Each mark has string id and type (circle, rect, line, text, path). Use unique IDs and clear label text; interactive:true makes a mark operable. Fixed properties are literal values; {expr:"formula"} derives a value from scene state.
- Geometry keys are x/y/x2/y2/r/width/height; optional style keys are fill/stroke/strokeWidth/opacity/fontSize. text supplies a text mark. points supplies a path as [[x,y],...] or {expr:"formula returning points"}. Colors include blue, green, orange, purple, red, gray, black, white, transparent, none, currentColor and literal 3/6-digit hex.

## Controls and feedback

Simulation and Game accept optional fields and metrics. A field has required name and label; type is `text`, `number`, `select`, `checkbox`, `slider`, `textarea` (default number), with optional value, min, max, step, unit, hint and options. Use scalar values; options are scalar values or {label,value,disabled?} objects. Fields edit matching names in scene.initial. At most 100 fields are accepted.

A metric has required label and formula, and optional unit and precision (0..10). Formulas use current scene values. At most 20 metrics are accepted. Use precision:0 for scores and counts. Put score, progress and user feedback in these metrics when they should remain readable outside the canvas; avoid duplicating the same feedback as tiny SVG text.

The components already implement local controls and state updates. Tick scenes have Play/Pause. Reset restores every initial field and seed, then runs the reset steps. When fields exist, Restart retains those current parameter values, restores the other fields and seed, then runs the same reset steps. For an initial-condition parameter such as v0, declare a separate changing field v and use reset steps such as {name:"v",value:"v0"}. Editing v changes current velocity immediately; editing a separate v0 sets the starting velocity used on Restart. Do not promise that Reset keeps chosen parameters.

Parameter editing pauses playback and cancels an owned drag. All control changes and metrics are local; they do not call the model. Expanded and inline views share the same scene values and player. Hidden or closed scenes pause; restoration starts paused. Keep transient pressed/drag feedback in declared state and clear it on end/cancel or reset.

## Working examples

```openui
root = Simulation({initial:{x:50,v:45},seed:1,events:{tick:[{name:"x",value:"mod(x + v * event.dt, 560)"}],reset:[{name:"x",value:"50"}]},marks:[{id:"track",type:"line",x:20,y:100,x2:580,y2:100,stroke:"gray"},{id:"ball",type:"circle",x:{expr:"x + 20"},y:100,r:16,fill:"blue",label:"小球"}],width:600,height:200},"motion","匀速运动",[{name:"v",label:"速度",type:"slider",value:45,min:0,max:120,step:1,unit:"px/s"}],[{label:"位置",formula:"x",unit:"px",precision:1}])
```

```openui
root = Game({initial:{score:0,x:80,y:100},seed:7,events:{click:[{name:"score",value:"event.id == 'target' ? score + 1 : score"},{name:"x",value:"event.id == 'target' ? 40 + rand() * 520 : x"},{name:"y",value:"event.id == 'target' ? 40 + rand() * 220 : y"}],key:[{name:"score",value:"event.key == 'Enter' ? score + 1 : score"},{name:"x",value:"event.key == 'Enter' ? 40 + rand() * 520 : x"},{name:"y",value:"event.key == 'Enter' ? 40 + rand() * 220 : y"}]},marks:[{id:"target",type:"circle",x:{expr:"x"},y:{expr:"y"},r:22,fill:"blue",label:"点击目标",interactive:true}],width:600,height:320},"targetGame","点中目标","点击蓝色圆点，或聚焦场景后按 Enter。",[],[{label:"得分",formula:"score",precision:0}])
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
