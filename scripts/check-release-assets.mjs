import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const repository = (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^https:\/\/github.com\//, '');
const privateAsset = name => /\.log$|(?:^|[-_.])(?:verification|validation|benchmark|handoff|research|evidence|plan)(?:[-_.]|$)|^(?:AGENTS|CLAUDE|AI_README|PLAN|REFERENCE)\.md$/i.test(name);
const args = process.argv.slice(2);
let assets = [];
if (args[0] === '--dir' && args.length === 2) assets = readdirSync(resolve(args[1])).map(name => ({ name }));
else if (!args.length) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw Error('GitHub repository metadata is required');
  for (let page = 1; ; page++) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Release inventory unavailable: HTTP ${response.status}`);
    const releases = await response.json();
    for (const release of releases) assets.push(...release.assets.map(asset => ({ name: asset.name, tag: release.tag_name })));
    if (releases.length < 100) break;
  }
} else throw Error('Usage: check-release-assets.mjs [--dir DIRECTORY]');
const bad = assets.filter(asset => privateAsset(asset.name));
if (bad.length) throw Error('Internal release attachments: ' + bad.map(asset => [asset.tag, asset.name].filter(Boolean).join('/')).join(', '));
console.log(`Release attachment names passed (${assets.length} assets). Archive contents are checked by the package gate.`);
