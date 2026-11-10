// Shared documentation checker for the DSH plugin repositories. The canonical copy lives in
// oh-my-dsh/scripts/check-docs.mjs; scripts/sync-docs-kit.mjs copies it byte for byte to the other repositories.
//   node scripts/check-docs.mjs                      structure, links, published facts and writing rules
//   node scripts/check-docs.mjs --release-notes [v]  print the CHANGELOG entry used as the GitHub Release body
//   node scripts/check-docs.mjs --repo [--apply]     compare (or update) the GitHub description, topics and homepage
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(resolve(root, file), 'utf8');
const config = JSON.parse(read('docs/structure.json'));
const pkg = JSON.parse(read('package.json'));
const args = process.argv.slice(2);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `published` is the last released package version; host and product versions are derived from it.
function parseVersion(version) {
  let match = /^(\d+\.\d+\.\d+)-dsh\.(.+)$/.exec(version || '');
  if (match) return { product: match[1], host: match[2] };
  match = /^(.+?)\.[a-z]+\.(\d+\.\d+\.\d+)$/.exec(version || '');
  return match ? { product: match[2], host: match[1] } : null;
}
const published = parseVersion(config.published);
const node = /(\d+\.\d+\.\d+)/.exec(pkg.engines?.node || '')?.[1];
const asset = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${config.published}.tgz`;
const slug = config.repository?.slug;

function changelogEntry(product) {
  if (!existsSync(resolve(root, 'CHANGELOG.md'))) return null;
  const text = read('CHANGELOG.md'), heads = [...text.matchAll(/^# .+$/gm)];
  const index = heads.findIndex(head => head[0].includes(` ${product} · DSH `));
  return index < 0 ? null : text.slice(heads[index].index, heads[index + 1]?.index ?? text.length).trim() + '\n';
}

if (args[0] === '--release-notes') {
  const product = parseVersion(args[1])?.product || args[1] || published?.product;
  const entry = changelogEntry(product);
  if (!entry) { console.error(`CHANGELOG.md has no entry titled "… ${product} · DSH …"`); process.exit(1); }
  process.stdout.write(entry);
  process.exit(0);
}

if (args[0] === '--repo') {
  const want = config.repository;
  const live = JSON.parse(execFileSync('gh', ['repo', 'view', slug, '--json', 'description,homepageUrl,repositoryTopics'], { encoding: 'utf8' }));
  const topics = (live.repositoryTopics || []).map(topic => topic.name);
  const add = want.topics.filter(topic => !topics.includes(topic)), remove = topics.filter(topic => !want.topics.includes(topic));
  const changes = [];
  if ((live.description || '') !== want.description) changes.push(`description: ${JSON.stringify(live.description)} → ${JSON.stringify(want.description)}`);
  if ((live.homepageUrl || '') !== (want.homepage || '')) changes.push(`homepage: ${JSON.stringify(live.homepageUrl)} → ${JSON.stringify(want.homepage || '')}`);
  if (add.length || remove.length) changes.push(`topics: +[${add}] -[${remove}]`);
  console.log(changes.length ? `${slug}\n  ${changes.join('\n  ')}` : `${slug}: up to date`);
  if (args.includes('--apply') && changes.length) {
    execFileSync('gh', ['repo', 'edit', slug, '--description', want.description, '--homepage', want.homepage || '',
      ...add.flatMap(topic => ['--add-topic', topic]), ...remove.flatMap(topic => ['--remove-topic', topic])], { stdio: 'inherit' });
  }
  process.exit(0);
}

const errors = [], warnings = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const gitFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const publicDoc = file => /\.md$/i.test(file) && !/^(?:vendor|src|test|tests|skills|plugins|\.github)\//.test(file);
const files = [...new Set(gitFiles.filter(publicDoc))].filter(file => existsSync(resolve(root, file))).sort();
const roles = new Set(['home', 'index', 'guide', 'development', 'sources', 'release', 'redirect']);
const documents = config.documents || [];
const mapped = new Map(documents.map(entry => [entry.path, entry]));
assert(config.schemaVersion === 2 && Array.isArray(config.documents), 'docs/structure.json: schemaVersion 2 with documents is required');
assert(published, `docs/structure.json: unrecognized published version ${config.published}`);
assert(/^[\w.-]+\/[\w.-]+$/.test(slug || ''), 'docs/structure.json: repository.slug is required');
assert(Number.isInteger(config.maxPages), 'docs/structure.json: maxPages is required');
assert(documents.length <= config.maxPages, `${documents.length} public pages exceed maxPages ${config.maxPages}; merge pages instead of adding new ones`);
assert(mapped.size === documents.length, 'Duplicate document registration');
assert(mapped.has('README.md') && mapped.has('README_EN.md'), 'Both product homepages must be registered');
for (const file of files) assert(mapped.has(file), `Unregistered public document: ${file}`);
for (const entry of documents) {
  assert(files.includes(entry.path), `Missing or out-of-scope document: ${entry.path}`);
  assert(roles.has(entry.role), `${entry.path}: invalid document role`);
  assert(['zh', 'en', 'bilingual'].includes(entry.language), `${entry.path}: invalid language`);
  if (entry.translation) {
    const other = mapped.get(entry.translation);
    assert(other && other.translation === entry.path && other.language !== entry.language, `${entry.path}: translation must be reciprocal and use a different language`);
  }
}

const fenced = /^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*(?:\n|$)/gm;
const history = /<!--\s*history\s*-->[\s\S]*?<!--\s*\/history\s*-->/g;
const visible = text => text.replace(fenced, '');
// Prose drops code, comments, link targets and HTML attributes so that writing rules only see the words a reader sees.
const prose = text => visible(text.replace(history, '')).replace(/<!--[\s\S]*?-->/g, '').replace(/`[^`\n]*`/g, '')
  .replace(/\]\([^)\n]*\)/g, ']').replace(/\b(?:href|src|srcset|alt)=["'][^"']*["']/g, '');
const anchorSlug = value => value.replace(/<[^>]*>/g, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');
const texts = new Map(), anchors = new Map();
const text = file => { if (!texts.has(file)) texts.set(file, read(file)); return texts.get(file); };
function ids(file) {
  if (anchors.has(file)) return anchors.get(file);
  const result = new Set(), counts = new Map(), value = visible(text(file));
  for (const match of value.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) result.add(match[1]);
  for (const match of value.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = anchorSlug(match[1]), count = counts.get(base) || 0;
    result.add(base + (count ? '-' + count : '')); counts.set(base, count + 1);
  }
  anchors.set(file, result); return result;
}
function links(value) {
  const output = [];
  for (const match of value.matchAll(/!?\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g)) output.push(match[1] || match[2]);
  for (const match of value.matchAll(/^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm)) output.push(match[1] || match[2]);
  for (const match of value.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) output.push(match[1]);
  return output;
}
const incoming = new Set();
let checked = 0;
for (const file of files) {
  for (const target of links(visible(text(file)))) {
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) continue;
    let url, dest, anchor;
    try { url = new URL(target, `https://docs.invalid/${file}`); dest = decodeURIComponent(url.pathname).slice(1); anchor = decodeURIComponent(url.hash.slice(1)); }
    catch { errors.push(`${file}: invalid link ${target}`); continue; }
    const path = resolve(root, dest);
    assert(existsSync(path), `${file}: missing link target ${target}`);
    if (!existsSync(path)) continue;
    assert(!relative(realpathSync(root), realpathSync(path)).startsWith('..'), `${file}: link escapes repository ${target}`);
    if (dest !== file) incoming.add(dest);
    if (/\.md$/i.test(dest) && anchor) assert(ids(dest).has(anchor), `${file}: missing anchor ${target}`);
    checked++;
  }
}
for (const entry of documents) {
  if (!['home', 'release', 'redirect'].includes(entry.role)) assert(incoming.has(entry.path), `${entry.path}: no public page links here; link it from an index or merge it`);
}

// Writing rules. Exceptions need an entry in structure.json "allow" with a reason; unused exceptions fail.
const reader = ['home', 'index', 'guide'];
const rules = [
  ['internal', null, /本轮(?:完整|核验|验证|修复|改动|工作|交付|发行)|交接|验收|\.local\/|PLAN\.md|用户于\s*\d{4}|用户\s*\d{4}-\d{1,2}-\d{1,2}|按用户(?:要求|决定|指定)|\bhandoffs?\b|\bthis round\b/gi, 'internal working note'],
  ['jargon', reader, /薄适配|\bREA\b|facade|Host[／/]Client[／/]preload|冒称|成功前缀|sourceEventSeqs/g, 'implementation term on a reader page'],
];
const allow = (config.allow || []).map(entry => ({ ...entry, used: false }));
const report = (path, rule, found, message) => {
  const exception = allow.find(entry => entry.path === path && entry.rule === rule && found.includes(entry.text));
  if (exception) exception.used = true; else errors.push(`${path}: ${message}: "${found}"`);
};
const limits = { home: 12000, index: 6000, guide: 16000, development: 32000, redirect: 600, ...config.limits };
const releasePath = new RegExp(`https://github\\.com/${escape(slug || '-')}/releases/(?:download|tag)/([^/\\s)"'<>]+)(?:/([^\\s)"'<>#]+))?`, 'g');
const named = [...(config.names || []).map(name => [name, published?.product]), ...Object.entries(config.versions || {})];
for (const entry of documents.filter(entry => files.includes(entry.path))) {
  const raw = text(entry.path), words = prose(raw), size = Buffer.byteLength(raw);
  const limit = config.limits?.[entry.path] ?? limits[entry.role];
  if (limit) assert(size <= limit, `${entry.path}: ${size} bytes exceed the ${entry.role} limit ${limit}; shorten or merge`);
  for (const [rule, scope, pattern, message] of rules) {
    if (entry.role === 'release' || (scope && !scope.includes(entry.role))) continue;
    for (const match of words.matchAll(pattern)) report(entry.path, rule, match[0], message);
  }
  if (entry.language === 'en') {
    for (const match of words.matchAll(/[A-Za-z0-9*_)\]][：；，。（）！？]|[：；，。（）！？][A-Za-z0-9*_[]/g)) report(entry.path, 'punctuation', match[0], 'full-width punctuation in English text');
  }
  if (entry.translation && entry.language === 'zh') {
    const headings = file => (visible(text(file)).match(/^#{1,3}\s/gm) || []).length;
    if (files.includes(entry.translation)) assert(headings(entry.path) === headings(entry.translation), `${entry.path}: heading count differs from ${entry.translation}; keep translations in step`);
  }
  if (reader.includes(entry.role)) {
    const hedges = words.match(/不等于|不证明|不代表|不能当作|并不意味着|does not (?:mean|prove|imply)|is not proof/gi) || [];
    if (hedges.length > 2) warnings.push(`${entry.path}: ${hedges.length} disclaimer-style sentences; say what the reader can do instead`);
    // Version facts must match the published release; history blocks may name older releases.
    const facts = raw.replace(history, '').replace(/%20/g, ' ');
    for (const match of facts.matchAll(releasePath)) {
      if (match[1] !== `v${config.published}` || (match[2] && ![asset, 'SHA256SUMS'].includes(match[2]))) report(entry.path, 'version', match[0], `release link must use v${config.published}/${asset}`);
    }
    for (const match of facts.matchAll(/\b0\.\d+\.\d+-{1,2}(?:rc|alpha|beta)\.\d+\b/g)) {
      if (match[0].replace('--', '-') !== published?.host) report(entry.path, 'version', match[0], `DSH host must be ${published?.host}`);
    }
    for (const match of facts.matchAll(/Node(?:\.js)?\W{0,4}(\d+\.\d+(?:\.\d+)?)\+/g)) {
      if (![match[1], match[1] + '.0'].includes(node)) report(entry.path, 'version', match[0], `Node.js requirement must be ${node}+`);
    }
    for (const [name, version] of named) {
      for (const match of facts.matchAll(new RegExp(`(?<!\\w)${escape(name)}\\s+v?(\\d+\\.\\d+\\.\\d+)\\b(?!\\.\\d)`, 'g'))) {
        if (match[1] !== version) report(entry.path, 'version', match[0], `${name} version must be ${version}`);
      }
    }
  }
}
for (const [field, value] of [['package.json description', pkg.description], ['repository.description', config.repository?.description]]) {
  assert(value, `${field} is required`);
  for (const match of String(value || '').matchAll(rules[1][2])) errors.push(`${field}: implementation term "${match[0]}"`);
}
if (published && existsSync(resolve(root, 'CHANGELOG.md'))) assert(changelogEntry(published.product), `CHANGELOG.md: missing entry "… ${published.product} · DSH ${published.host}"`);
for (const entry of allow) assert(entry.used && entry.reason, `docs/structure.json: allow entry for ${entry.path} (${entry.rule}: ${entry.text}) is unused or has no reason`);

for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Documentation passed (${files.length} pages, ${checked} local links, ${warnings.length} warnings).`);
