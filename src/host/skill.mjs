import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { catalog, examples } from '../catalog.mjs';

export const skillDirectory = fileURLToPath(new URL('../../skills/intelligent-ui/', import.meta.url));
export const skillSummary = 'Create interactive answers, calculators, diagrams, simulations and games inside the conversation.';
const BASE = new Set(['Stack', 'Card', 'Text', 'Heading', 'Metric', 'Checkbox', 'NumberInput', 'Calculator']);
export const groups = [...new Set(Object.values(catalog).map(item => item.group))].sort();

function spec(name, component) {
  const schema=z.toJSONSchema(component.schema,{unrepresentable:'any'});
  const type=(value,depth=0)=>value.enum?value.enum.map(v=>JSON.stringify(v)).join('|'):value.anyOf?value.anyOf.map(v=>type(v,depth)).join('|'):value.type==='array'?`${type(value.items??{},depth+1)}[]${value.maxItems?' (max '+value.maxItems+')':''}`:value.type==='object'?'object':value.type??'JSON';
  const signature=component.args.map(key=>{const value=schema.properties?.[key]??{};return `${key}${schema.required?.includes(key)?'':'?'}: ${type(value)}${value.default!==undefined?' = '+JSON.stringify(value.default):''}${value.maximum!==undefined?' <= '+value.maximum:''}${value.minimum!==undefined?' >= '+value.minimum:''}`;}).join(', ');
  return `${name}(${signature}) — ${component.description}\nSchema:\n${JSON.stringify(schema,null,2)}`;
}
export function renderCatalog(group) {
  return Object.entries(catalog).filter(([name, item]) => group ? item.group === group : BASE.has(name)).map(([name, item]) => spec(name, item)).join('\n\n');
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
    const content = `# ${group} components\n\nGenerated from src/catalog.mjs. Positional argument order and allowed enum values are authoritative. Omit optional gap for standard spacing; numeric gap is pixels from 0 to 48. Read signatures and examples first. For Scene/Game events and drawing, read expressions.md. Detailed schemas are below; use native paging or search for a specific component when needed.\n\n## Signatures\n\n${signatures}\n\n## Examples\n\n${relevant.map(source => '```openui\n' + source + '\n```').join('\n\n')}\n\n## Complete argument schemas\n\n${renderCatalog(group)}\n`;
    await writeFile(new URL(`${group}.md`, directory), content);
  }
}
