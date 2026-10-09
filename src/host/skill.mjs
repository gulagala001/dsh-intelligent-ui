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
  return `${name}(${component.args.join(', ')}) — ${component.description}\nSchema: ${JSON.stringify(z.toJSONSchema(component.schema, { unrepresentable: 'any' }))}`;
}
export function renderCatalog(group) {
  return Object.entries(catalog).filter(([name, item]) => group ? item.group === group : BASE.has(name)).map(([name, item]) => spec(name, item)).join('\n\n');
}
export function skillContent() {
  const raw = readFileSync(new URL('../../skills/intelligent-ui/SKILL.md', import.meta.url), 'utf8');
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  return `${body}\n\n## Installed base catalog\n\nThe following signatures and schemas are generated from this build's component definitions. Use only these components when reference-file reading is unavailable.\n\n${renderCatalog()}`;
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
    const relevant = examples.filter(source => names.some(name => source.includes(`${name}(`))).slice(0, 4);
    const content = `# ${group} components\n\nGenerated from src/catalog.mjs. Positional argument order is authoritative. JSON schema describes each argument; omit optional trailing arguments.\n\n${renderCatalog(group)}\n\n## Examples\n\n${relevant.map(source => '```openui\n' + source + '\n```').join('\n\n')}\n`;
    await writeFile(new URL(`${group}.md`, directory), content);
  }
}
