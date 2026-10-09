# Bounded expressions and scene events

Use formula strings with scalar values, named local state, arithmetic, comparisons, boolean operators and a ternary conditional. Plain references such as `bill` and `$bill` read the bound value. Expressions are interpreted with operation, depth and collection limits. Never write JavaScript, assignments, constructors, `Math.*`, `Query`, `Mutation` or native `Action` calls.

Available pure functions: `abs`, `floor`, `ceil`, `sqrt`, `sin`, `cos`, `tan`, `log`, `exp`, `round`, `pow`, `mod`, `clamp`, `min`, `max`, `sum`, `avg`, `count`, `len`, `first`, `last`, `concat`, `range`, `each`, `filter`. `Each(list, item, expression)` and `Filter(list, item, expression)` bind the named item and `index`. Keep arrays short and formulas simple; do not simulate unbounded recursion or loops. `rand()` is available only inside scene event evaluation, with deterministic seeded state.

Calculator field names are direct formula variables: `"principal * pow(1 + rate / 100, years)"`. Scene fields and state are local to the bound scene. Use `{expr:"x + 20"}` where a mark property accepts a formula value. A scene has `initial`, `events`, `marks` and optional `seed`, `width`, `height`, as specified by the installed interactive catalog.

Scene `events` maps `click`, `key`, `tick` or `reset` to bounded local updates of the form `{name:"x",value:"x + v * event.dt"}`. Event fields include `event.key` for keyboard input and `event.dt` for tick time. Marks may opt into `interactive:true`; use accessible `label` text. Playback is a visible user control, never an automatic tool or model request. Hidden, streaming and disabled scenes suspend playback. Consult the installed component schema and examples before choosing scene event fields.

Local Button actions use plain JSON data: `{type:"set",name:"value",value:1}`, `{type:"reset",name:"value"}` or `{type:"submit",text:"Continue",fields:["value"]}`. Submit is explicit user interaction and routes back to the original conversation; it does not grant the document tools, files, credentials or network access.

## Scene interaction and drawing

`Scene(scene, bind, title?)`, `Simulation(scene, bind, title?, fields?, metrics?)`, and `Game(scene, bind, title?, instructions?)` use the same data engine. `scene.initial` declares every mutable field. `scene.events` contains optional `click`, `key`, `tick`, `reset` arrays of `{name, value}` steps. Each value is a pure formula string. Steps update declared fields in order; the entire event commits atomically. Use an explicit integer seed for repeatable `rand()` in events.

Click payload: `event.id` is the selected mark ID, and `event.x`, `event.y` are SVG coordinates. Keyboard payload: `event.key`, plus the selected mark ID when applicable. Tick payload: `event.dt` is seconds, clamped to 0–0.1. Click/key work while paused; they do not require or start playback. Tick requires the user's explicit Play action and stops while hidden. Reset restores initial fields and seed, then runs optional reset steps.

Marks support circle, rect, line, text and path. ID/type/label are strings; interactive is boolean. Geometry fields include x/y/x2/y2/width/height/r; text, fill, stroke, strokeWidth, opacity and fontSize are optional. A fixed value stays literal; `{expr:"x + 10"}` computes from scene state. Paths use points `[[x,y],...]` or `{expr:"formula returning points"}`. Colors are blue, green, orange, purple, red, gray, black, white, transparent, none, currentColor or literal 3/6-digit hex. Geometry is bounded; use compact dimensions up to 2000 and at most 1000 marks. Do not put JavaScript, DOM, CSS, network access or method calls into formulas.

For a grid game, marks can be generated with `Each(Range(count), i, {id:concat("cell-",i),type:"rect",...})`. In a click event, compare `event.id == concat("cell-", index)` while mapping the board with `each(board,item,...)`. `index` is the local zero-based item index. `rand()` is available in event transitions, not drawing expressions.

Chart legend buttons toggle series. Selecting a data row shows point details; it does not remove rows. Table headers sort; row selection does not filter the table. Compose explicit inputs and bounded `filter` expressions when row filtering is needed.
