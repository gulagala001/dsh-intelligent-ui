# Bounded expressions and scene events

Use formula strings with scalar values, named local state, arithmetic, comparisons, boolean operators and a ternary conditional. Plain references such as `bill` and `$bill` read the bound value. Expressions are interpreted with operation, depth and collection limits. Never write JavaScript, assignments, constructors, `Math.*`, `Query`, `Mutation` or native `Action` calls.

Available pure functions: `abs`, `floor`, `ceil`, `sqrt`, `sin`, `cos`, `tan`, `log`, `exp`, `round`, `pow`, `mod`, `clamp`, `min`, `max`, `sum`, `avg`, `count`, `len`, `first`, `last`, `concat`, `range`, `each`, `filter`. `Each(list, item, expression)` and `Filter(list, item, expression)` bind the named item and `index`. Keep arrays short and formulas simple; do not simulate unbounded recursion or loops. `rand()` is available only inside scene event evaluation, with deterministic seeded state.

Calculator field names are direct formula variables: `"principal * pow(1 + rate / 100, years)"`. Scene fields and state are local to the bound scene. Use `{expr:"x + 20"}` where a mark property accepts a formula value. A scene has `initial`, `events`, `marks` and optional `seed`, `width`, `height`, as specified by the installed interactive catalog.

Scene `events` maps `click`, `key`, `tick` or `reset` to bounded local updates of the form `{name:"x",value:"x + v * event.dt"}`. Event fields include `event.key` for keyboard input and `event.dt` for tick time. Marks may opt into `interactive:true`; use accessible `label` text. Playback is a visible user control, never an automatic tool or model request. Hidden, streaming and disabled scenes suspend playback. Consult the installed component schema and examples before choosing scene event fields.

Local Button actions use plain JSON data: `{type:"set",name:"value",value:1}`, `{type:"reset",name:"value"}` or `{type:"submit",text:"Continue",fields:["value"]}`. Submit is explicit user interaction and routes back to the original conversation; it does not grant the document tools, files, credentials or network access.
