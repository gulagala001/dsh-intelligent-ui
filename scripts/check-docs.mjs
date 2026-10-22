import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const configPath = resolve(root, 'docs/structure.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const fail = [];
const assert = (condition, message) => { if (!condition) fail.push(message); };
const gitFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const publicDoc = file => /\.md$/i.test(file) && !/^(?:vendor|src|test|tests|skills|plugins|\.github)\//.test(file);
const files = [...new Set(gitFiles.filter(publicDoc))].filter(file => existsSync(resolve(root, file))).sort();
const roles = new Set(['home', 'index', 'guide', 'development', 'sources', 'release', 'redirect']);
assert(config.schemaVersion === 1 && Array.isArray(config.documents), 'Unsupported documentation manifest');
const documents = config.documents || [];
const mapped = new Map(documents.map(entry => [entry.path, entry]));
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

const visible = text => text.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*(?:\n|$)/gm, '');
const slug = value => value.replace(/<[^>]*>/g, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');
const texts = new Map();
const anchors = new Map();
function text(file) {
  if (!texts.has(file)) texts.set(file, visible(readFileSync(resolve(root, file), 'utf8')));
  return texts.get(file);
}
function ids(file) {
  if (anchors.has(file)) return anchors.get(file);
  const result = new Set(), counts = new Map(), value = text(file);
  for (const match of value.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) result.add(match[1]);
  for (const match of value.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = slug(match[1]), count = counts.get(base) || 0;
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
const incoming = new Map();
let checked = 0;
for (const file of files) {
  for (const target of links(text(file))) {
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) continue;
    let url;
    try { url = new URL(target, `https://docs.invalid/${file}`); } catch { fail.push(`${file}: invalid link ${target}`); continue; }
    let dest, anchor;
    try { dest = decodeURIComponent(url.pathname).slice(1); anchor = decodeURIComponent(url.hash.slice(1)); } catch { fail.push(`${file}: invalid URL escape ${target}`); continue; }
    const path = resolve(root, dest);
    assert(existsSync(path), `${file}: missing link target ${target}`);
    if (!existsSync(path)) continue;
    assert(!relative(realpathSync(root), realpathSync(path)).startsWith('..'), `${file}: link escapes repository ${target}`);
    if (dest !== file) { if (!incoming.has(dest)) incoming.set(dest, new Set()); incoming.get(dest).add(file); }
    if (/\.md$/i.test(dest) && anchor) assert(ids(dest).has(anchor), `${file}: missing anchor ${target}`);
    checked++;
  }
}
// Every public page is discoverable from the generated documentation map.
// Product homepages must also expose the maintenance guide, so that the map is reachable.
for (const home of ['README.md', 'README_EN.md']) {
  assert(links(text(home)).includes('docs/documentation.md'), `${home}: link to docs/documentation.md is required`);
}

function policy() {
  const rows = [...documents].sort((a, b) => a.path.localeCompare(b.path, 'en')).map(entry => `| [${entry.path}](${posix.relative('docs', entry.path)}) | ${entry.role} | ${entry.language} | ${entry.translation ? `[${entry.translation}](${posix.relative('docs', entry.translation)})` : '—'} |`).join('\n');
  return `# 文档结构与贡献 / Documentation structure\n\n[中文首页](../README.md) · [English homepage](../README_EN.md)\n\n<!-- Generated by scripts/check-docs.mjs from docs/structure.json. -->\n\n## 中文\n\n\`docs/structure.json\` 是本仓库公开文档的结构清单，登记页面职责、语言及翻译对应关系。本页由该清单生成；产品功能、安装和版本事实继续在对应指南中维护。\n\n- 首页介绍本产品并提供安装、使用、兼容和来源入口；指南按用户任务组织，开发文档服务于外部贡献者。\n- 内部计划、交接、真实会话、运行日志、原始研究和验收流水只留本地，不进入仓库、站点、安装包或 Release 附件。维护测试和合成夹具保留。\n- 来源与许可保留原作者、维护者、固定版本及适配说明。历史版本和跳转页有安装、回退或外部引用时继续保留。\n- 增删、移动或改变页面职责时，同步修改清单、中英文入口、首页／目录／站点导航、素材引用和打包配置。生成器或规则改变时，同步本脚本中的公开规范。\n- 运行 \`node scripts/check-docs.mjs --write\` 更新本页，再运行 \`npm run docs:check\`。CI 与 prepack 运行同一检查，未登记页面、失效路径／锚点、错误翻译对应或过期生成页均阻止通过。\n- 纯措辞修改不用修改结构清单。旧路径有外部引用时保留简短跳转，避免仅为统一命名造成断链。\n- 版本说明按完整版本与精确宿主命名，分中文／English 两区，按实际内容列新增功能、体验优化、问题修复和其他变更，省略空分类；末尾提供统一安装区、固定包、安装指南与 SHA256SUMS。\n\n## English\n\n\`docs/structure.json\` is the repository's public documentation inventory: page responsibilities, languages and translation pairs. This page is generated from that inventory. Product behavior, installation and version facts remain in their respective guides.\n\n- Homepages introduce this product and link to installation, usage, compatibility and sources. Guides follow user tasks; developer documentation supports contributors.\n- Keep internal plans, handoffs, real conversations, runtime logs, raw research and verification output local. They must not enter Git, the website, packages or release attachments. Retain maintenance tests and synthetic fixtures.\n- Preserve authorship, maintainers, pinned sources, licenses and adaptation notes. Keep historical versions and redirects needed by installation, rollback or external links.\n- Add, move or remove pages together with inventory entries, translations, homepages, indexes, website navigation, assets and packaging configuration. Update this script's public policy when changing the generator or its rules.\n- Run \`node scripts/check-docs.mjs --write\`, then \`npm run docs:check\`. CI and prepack use the same check for unregistered pages, missing paths or anchors, invalid translation pairs and stale generated documentation.\n- Wording-only edits do not require inventory changes. Preserve short redirects where old paths have external consumers.\n- Release notes name the full version and exact host, separate Chinese and English sections, omit empty categories, and finish with fixed packages, installation guides and SHA256SUMS.\n\n## 页面清单 / Page inventory\n\nRoles: home · index · guide · development · sources · release · redirect. Languages: zh · en · bilingual.\n\n| Page | Role | Language | Translation |\n| --- | --- | --- | --- |\n${rows}\n`;
}
const expected = policy(), output = resolve(root, 'docs/documentation.md');
if (process.argv.includes('--write')) writeFileSync(output, expected);
else assert(existsSync(output) && readFileSync(output, 'utf8') === expected, 'docs/documentation.md is stale; run node scripts/check-docs.mjs --write');
if (fail.length) { console.error(fail.join('\n')); process.exitCode = 1; }
else console.log(`Documentation structure passed (${files.length} pages, ${checked} local links).`);
