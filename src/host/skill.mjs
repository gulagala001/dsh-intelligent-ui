import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { catalog, examples, sceneSchema } from '../catalog.mjs';

export const skillDirectory = fileURLToPath(new URL('../../skills/intelligent-ui/', import.meta.url));
export const skillSummary = 'Create interactive answers, calculators, diagrams, simulations and games inside the conversation.';
const BASE = new Set(['Stack', 'Card', 'Text', 'Heading', 'Metric', 'Checkbox', 'NumberInput', 'Calculator']);
export const groups = [...new Set(Object.values(catalog).map(item => item.group))].sort();

export const sceneSchemaId = 'iui:scene';
export function sharedSceneJSONSchema() {
  return { ...z.toJSONSchema(sceneSchema, { unrepresentable: 'any' }), $id: sceneSchemaId };
}
function usesLocalDefinitions(value) {
  return value && typeof value === 'object' && (typeof value.$ref === 'string' && value.$ref.startsWith('#/$defs/') || Object.values(value).some(usesLocalDefinitions));
}
function spec(name, component, shareScene = false) {
  const schema=z.toJSONSchema(component.schema,{unrepresentable:'any'});
  const type=(value,depth=0)=>value.enum?value.enum.map(v=>JSON.stringify(v)).join('|'):value.anyOf?value.anyOf.map(v=>type(v,depth)).join('|'):value.type==='array'?`${type(value.items??{},depth+1)}[]${value.maxItems?' (max '+value.maxItems+')':''}`:value.type==='object'?'object':value.type??'JSON';
  const signature=component.args.map(key=>{const value=schema.properties?.[key]??{};return `${key}${schema.required?.includes(key)?'':'?'}: ${type(value)}${value.default!==undefined?' = '+JSON.stringify(value.default):''}${value.maximum!==undefined?' <= '+value.maximum:''}${value.minimum!==undefined?' >= '+value.minimum:''}`;}).join(', ');
  if (shareScene && schema.properties?.scene) {
    const { $schema, $id, $defs, ...sharedBody } = sharedSceneJSONSchema();
    // The common schema must remain exactly the catalog's scene argument and
    // recursive JSON definitions, including every constraint and default.
    if (JSON.stringify(schema.properties.scene) !== JSON.stringify(sharedBody) || JSON.stringify(schema.$defs) !== JSON.stringify($defs)) {
      throw new Error(`${name} scene argument differs from the shared ${sceneSchemaId} schema`);
    }
    schema.properties.scene = { $ref: sceneSchemaId };
    const { $defs: localDefinitions, ...body } = schema;
    if (localDefinitions && !usesLocalDefinitions(body)) delete schema.$defs;
  }
  return `${name}(${signature}) — ${component.description}\nSchema:\n${JSON.stringify(schema,null,2)}`;
}
export function renderCatalog(group) {
  const shareScene = group === 'interactive';
  const components = Object.entries(catalog).filter(([name, item]) => group ? item.group === group : BASE.has(name)).map(([name, item]) => spec(name, item, shareScene)).join('\n\n');
  if (!shareScene) return components;
  return `## Shared Scene argument schema

The JSON Schema resource below is generated from sceneSchema in src/catalog.mjs. Its $id is "${sceneSchemaId}"; the Scene, Simulation and Game argument schemas resolve their scene $ref to this resource. Local #/$defs/ references resolve within this resource. All other component arguments remain defined inline.

Schema:
${JSON.stringify(sharedSceneJSONSchema(),null,2)}

## Component argument schemas

${components}`;
}
export function renderSceneGuide() {
  const signatures=['Scene','Simulation','Game'].map(name=>spec(name,catalog[name]).split('\n')[0]).join('\n');
  const scene=z.toJSONSchema(sceneSchema,{unrepresentable:'any'}).properties;
  const parameterSchema=z.toJSONSchema(catalog.Simulation.schema,{unrepresentable:'any'}).properties;
  const fields=parameterSchema.fields.items.properties,metrics=parameterSchema.metrics.items.properties;
  const examplesForGuide=['Simulation','Game','Scene'].map(name=>examples.find(source=>source.startsWith('root = '+name+'(')));
  if(examplesForGuide.some(source=>!source))throw Error('Every scene component needs an installed working example');
  return `# Scenes, simulations and games

Use these positional signatures and working examples to compose a scene answer. This guide is generated from the installed catalog. The full schemas are in interactive.md; additional formula functions are in expressions.md.

## Signatures

${signatures}

## Local scene contract

- A scene has required initial, events and marks, plus optional actions, seed, width and height. initial is plain JSON keyed by declared field names (letter/underscore first, then letters/digits/underscores, at most 64 characters). Every event can update only these declared fields. Scene state is private to its bind.
- width defaults to ${scene.width.default}, height to ${scene.height.default}; both are positive and at most ${scene.width.maximum}. Use compact dimensions and at most ${scene.marks.maxItems} marks.
- events contains optional ${scene.events.propertyNames.enum.map(name=>'`'+name+'`').join(', ')} arrays of {name,value}. name identifies a declared field; value is a quoted pure formula. Steps see preceding steps' updated values; the whole event commits atomically. To integrate motion, update position with the current velocity before updating velocity.
- Scalars, arithmetic, comparisons, boolean operators and a ternary conditional work. Common pure functions include min, max, clamp, mod, round, floor, abs and concat. rand() is available only in event transitions and uses the scene seed. Do not write JavaScript, assignments or Math methods in a formula.
- click gives event.id; SVG pointer clicks also give event.x/event.y. An action button, Enter/Space on that button and its explicit shortcut all run the same click rules for its id; do not duplicate button activation in key rules. key gives event.key and the focused mark or action's event.id (or scene). For SVG marks, a defined key event receives Enter/Space instead of a synthetic click: provide equivalent rules for the desired keys. Custom key rules can still handle non-activation keys. tick gives event.dt in seconds, clamped to 0..0.1. Playback starts only with the user's Play action.
- drag requires an interactive mark and events.drag. It gives event.id, event.phase (start/move/end/cancel), SVG event.x/event.y and event.dx/event.dy since the previous delivered event. Use move-only updates to preserve the pick-up offset. Start/end have zero movement; release flushes the final move first. Cancel drops a pending move. Coordinates stay within the scene.
- Each action has a unique non-empty string id and required label. At most ${scene.actions.maxItems} actions are accepted. Optional detail, symbol, selected, disabled and color may be literal values or {expr:"formula"}; label may also be derived. label/detail resolve to text, number or boolean, symbol to a string of at most 16 characters, and selected/disabled to strict booleans. color uses the same color values as marks.
- An action may declare one ASCII letter or digit as shortcut. Shortcuts are case-insensitive and must be unique within the scene. While focus is inside the scene, an explicit shortcut takes precedence over custom key rules. Declared shortcuts ignore auto-repeat and Ctrl/Meta/Alt key combinations; Shift may change a letter's case. Enter/Space use the native click path without also dispatching a scene key event. Shortcut keys are not global.
- Each mark has string id and type (circle, rect, line, text, path). Use unique IDs and clear label text; interactive:true makes a mark operable. Fixed properties are literal values; {expr:"formula"} derives a value from scene state.
- Geometry keys are x/y/x2/y2/r/width/height; optional style keys are fill/stroke/strokeWidth/opacity/fontSize. text supplies a text mark. points supplies a path as [[x,y],...] or {expr:"formula returning points"}. Colors include blue, green, orange, purple, red, gray, black, white, transparent, none, currentColor and literal 3/6-digit hex.

## Controls and feedback

For selection, matching, ordering and other non-spatial interactions, prefer semantic action buttons with readable labels and optional detail or symbols. Keep spatial targets and dragging in marks. Use marks:[] with actions for a button-card experience, or combine actions and marks when the same local state drives both controls and graphics.

Simulation and Game accept optional fields and metrics. A field has required name and label; type is ${fields.type.enum.map(type=>'`'+type+'`').join(', ')} (default ${fields.type.default}), with optional value, min, max, step, unit, hint and options. Use scalar values; options are scalar values or {label,value,disabled?} objects. Fields edit matching names in scene.initial. At most ${parameterSchema.fields.maxItems} fields are accepted.

A metric has required label and formula, and optional unit and precision (0..${metrics.precision.maximum}). Formulas use current scene values. At most ${parameterSchema.metrics.maxItems} metrics are accepted. Use precision:0 for scores and counts. Put score, progress and user feedback in these metrics when they should remain readable outside the canvas; avoid duplicating the same feedback as tiny SVG text.

The components already implement local controls and state updates. Tick scenes have Play/Pause. Reset restores every initial field and seed, then runs the reset steps. When fields exist, Restart retains those current parameter values, restores the other fields and seed, then runs the same reset steps. For an initial-condition parameter such as v0, declare a separate changing field v and use reset steps such as {name:"v",value:"v0"}. Editing v changes current velocity immediately; editing a separate v0 sets the starting velocity used on Restart. Do not promise that Reset keeps chosen parameters.

Parameter editing pauses playback and cancels an owned drag. All control changes and metrics are local; they do not call the model. Expanded and inline views share the same scene values and player. Hidden or closed scenes pause; restoration starts paused. Keep transient pressed/drag feedback in declared state and clear it on end/cancel or reset.

## Working examples

${examplesForGuide.map(source=>'```openui\n'+source+'\n```').join('\n\n')}
`;
}
export function skillContent() {
  const raw = readFileSync(new URL('../../skills/intelligent-ui/SKILL.md', import.meta.url), 'utf8');
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  const signatures=Object.entries(catalog).filter(([name])=>BASE.has(name)).map(([name,item])=>spec(name,item).split('\n')[0]).join('\n');
  const calculatorSchema=JSON.stringify(z.toJSONSchema(catalog.Calculator.schema,{unrepresentable:'any'}));
  return `${body}\n\n## Installed base catalog\n\nThese signatures are generated from this build's component definitions. Use only these components when reference-file reading is unavailable. Children are arrays of component calls; bind names use letters, digits and underscores, starting with a letter or underscore.\n\n${signatures}\n\nCalculator argument schema (including field and additional-result objects):\n${calculatorSchema}`;
}
export function installSkill(ctx) {
  const summary = { name: 'intelligent-ui', description: skillSummary, source: 'bundled', provider: 'dsh-intelligent-ui', invocation: { modelInvocable: true, userInvocable: true }, resourceBase: { kind: 'directory', path: skillDirectory }, path: fileURLToPath(new URL('../../skills/intelligent-ui/SKILL.md', import.meta.url)) };
  ctx.skills.registerProvider(() => ({
    name: summary.provider,
    list: async () => [{ ...summary, rank: 600, locator: summary.path }],
    get: async (candidate, options = {}) => {
      options.signal?.throwIfAborted();
      if (candidate.name !== summary.name || candidate.locator !== summary.path) return undefined;
      return { ...summary, content: skillContent() };
    },
  }));
}

/** Build-time generation; never rewrite packaged files when the plugin runs. */
export async function writeReferences() {
  const directory = new URL('../../skills/intelligent-ui/references/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const group of groups) {
    const names = Object.keys(catalog).filter(name => catalog[name].group === group);
    const candidates = examples.filter(source => names.some(name => source.includes(`${name}(`)));
    const relevant = [...new Set(names.map(name => candidates.find(source => source.includes(`${name}(`))).filter(Boolean))];
    const signatures=names.map(name=>spec(name,catalog[name]).split('\n')[0]).join('\n');
    const dataGuide=group==='data'?'Chart series objects may specify an explicit unit. For line, area, bar and scatter charts, series with the same unit can be plotted together; different unit groups use the metric selector. Values are shown as supplied; the chart does not convert units. For a requested chart, put the requested primary measure first and include its known unit. Do not place monthly fees and storage capacities on the same comparable axis; add other metrics only when they help answer the request.\n\n':'';
    const dataCategoryGuide=group==='data'?'Chart accepts categoryFilters (default false) and colorBy ("series" by default, or "category") after bind. Enable categoryFilters to show grouped controls for the x column; equal typed category values filter together. Category colors stay consistent while filtering or reordering the same full category set; the six-color palette repeats, and changing that set may change colors. With colorBy:"category", bar/scatter/pie marks use category colors, and line/area charts use matching point colors and gradients. Filtering changes visible plots, scales and hit targets while the raw data table retains every row and series. Pie charts show one selected metric and already support category filtering; categoryFilters uses the grouped controls. All selectors and filters update only local state.\n\n':'';
    const content = `# ${group} components\n\nGenerated from src/catalog.mjs. Positional argument order and allowed enum values are authoritative. Omit optional gap for standard spacing; numeric gap is pixels from 0 to 48. Read signatures and examples first. For Scene/Game events and drawing, read expressions.md. Detailed schemas are below; use native paging or search for a specific component when needed.\n\n${dataGuide}${dataCategoryGuide}## Signatures\n\n${signatures}\n\n## Examples\n\n${relevant.map(source => '```openui\n' + source + '\n```').join('\n\n')}\n\n## Complete argument schemas\n\n${renderCatalog(group)}\n`;
    await writeFile(new URL(`${group}.md`, directory), content);
  }
  await writeFile(new URL('scenes.md',directory),renderSceneGuide());
}
