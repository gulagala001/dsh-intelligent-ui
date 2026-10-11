# Scenes, simulations and games

Use these positional signatures and working examples to compose a scene answer. This guide is generated from the installed catalog. The full schemas are in interactive.md; additional formula functions are in expressions.md.

## Signatures

Scene(scene: object, bind: string, title?: string|null) — General bounded scene with SVG drawing and semantic action cards. Click, key and drag events update local state through safe formulas; playback is explicit and pauses while hidden.
Simulation(scene: object, bind: string, title?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene simulation with parameter controls and calculated metrics.
Game(scene: object, bind: string, title?: string|null, instructions?: string|null, fields: object[] (max 100) = [], metrics: object[] (max 20) = []) — General scene game using click, key or drag rules and deterministic bounded state, with optional parameter controls and live score or progress metrics.

## Local scene contract

- A scene has required initial, events and marks, plus optional actions, seed, width and height. initial is plain JSON keyed by declared field names (letter/underscore first, then letters/digits/underscores, at most 64 characters). Every event can update only these declared fields. Scene state is private to its bind.
- width defaults to 600, height to 320; both are positive and at most 2000. Use compact dimensions and at most 1000 marks.
- events contains optional `click`, `key`, `tick`, `reset`, `drag` arrays of {name,value}. name identifies a declared field; value is a quoted pure formula. Steps see preceding steps' updated values; the whole event commits atomically. To integrate motion, update position with the current velocity before updating velocity.
- Scalars, arithmetic, comparisons, boolean operators and a ternary conditional work. Common pure functions include min, max, clamp, mod, round, floor, abs and concat. rand() is available only in event transitions and uses the scene seed. Do not write JavaScript, assignments or Math methods in a formula.
- click gives event.id; SVG pointer clicks also give event.x/event.y. An action button, Enter/Space on that button and its explicit shortcut all run the same click rules for its id; do not duplicate button activation in key rules. key gives event.key and the focused mark or action's event.id (or scene). For SVG marks, a defined key event receives Enter/Space instead of a synthetic click: provide equivalent rules for the desired keys. Custom key rules can still handle non-activation keys. tick gives event.dt in seconds, clamped to 0..0.1. Playback starts only with the user's Play action.
- drag requires an interactive mark and events.drag. It gives event.id, event.phase (start/move/end/cancel), SVG event.x/event.y and event.dx/event.dy since the previous delivered event. Use move-only updates to preserve the pick-up offset. Start/end have zero movement; release flushes the final move first. Cancel drops a pending move. Coordinates stay within the scene.
- Each action has a unique non-empty string id and required label. At most 32 actions are accepted. Optional detail, symbol, selected, disabled and color may be literal values or {expr:"formula"}; label may also be derived. label/detail resolve to text, number or boolean, symbol to a string of at most 16 characters, and selected/disabled to strict booleans. color uses the same color values as marks.
- An action may declare one ASCII letter or digit as shortcut. Shortcuts are case-insensitive and must be unique within the scene. While focus is inside the scene, an explicit shortcut takes precedence over custom key rules. Declared shortcuts ignore auto-repeat and Ctrl/Meta/Alt key combinations; Shift may change a letter's case. Enter/Space use the native click path without also dispatching a scene key event. Shortcut keys are not global.
- Each mark has string id and type (circle, rect, line, text, path). Use unique IDs and clear label text; interactive:true makes a mark operable. Fixed properties are literal values; {expr:"formula"} derives a value from scene state.
- Geometry keys are x/y/x2/y2/r/width/height; optional style keys are fill/stroke/strokeWidth/opacity/fontSize. text supplies a text mark. points supplies a path as [[x,y],...] or {expr:"formula returning points"}. Colors include blue, green, orange, purple, red, gray, black, white, transparent, none, currentColor and literal 3/6-digit hex.

## Controls and feedback

For selection, matching, ordering and other non-spatial interactions, prefer semantic action buttons with readable labels and optional detail or symbols. Keep spatial targets and dragging in marks. Use marks:[] with actions for a button-card experience, or combine actions and marks when the same local state drives both controls and graphics.

Simulation and Game accept optional fields and metrics. A field has required name and label; type is `text`, `number`, `select`, `checkbox`, `slider`, `textarea` (default number), with optional value, min, max, step, unit, hint and options. Use scalar values; options are scalar values or {label,value,disabled?} objects. Fields edit matching names in scene.initial. At most 100 fields are accepted.

A metric has required label and formula, and optional unit and precision (0..10). Formulas use current scene values. At most 20 metrics are accepted. Use precision:0 for scores and counts. Put score, progress and user feedback in these metrics when they should remain readable outside the canvas; avoid duplicating the same feedback as tiny SVG text.

The components already implement local controls and state updates. Tick scenes have Play/Pause. Reset restores every initial field and seed, then runs the reset steps. When fields exist, Restart retains those current parameter values, restores the other fields and seed, then runs the same reset steps. For an initial-condition parameter such as v0, declare a separate changing field v and use reset steps such as {name:"v",value:"v0"}. Editing v changes current velocity immediately; editing a separate v0 sets the starting velocity used on Restart. Do not promise that Reset keeps chosen parameters.

Parameter editing pauses playback and cancels an owned drag. All control changes and metrics are local; they do not call the model. Expanded and inline views share the same scene values and player. Hidden or closed scenes pause; restoration starts paused. Keep transient pressed/drag feedback in declared state and clear it on end/cancel or reset.

## Working examples

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
