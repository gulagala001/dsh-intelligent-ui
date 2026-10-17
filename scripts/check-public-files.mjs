// Public release gate: inspect the Git index and pnpm's actual file list, never local ignored files.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import { packageManager } from './package-manager.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = packageManager();
const privateDirectories = new Set([
  '.git', 'node_modules', 'work', '.cache', '.auth', '.credentials', '.local', '.codegraph',
  'playwright-report', 'test-results', 'coverage', 'blob-report',
]);

function reasonFor(path, current = true) {
  const parts = path.replaceAll('\\', '/').toLowerCase().split('/');
  const name = parts.at(-1);
  if (current && (name === 'codegraph.json' || name.endsWith('.prompt.txt') || path === 'docs/resource-research.md')) return 'internal research, generation prompt or code index';
  if (parts.some(part => privateDirectories.has(part))) return 'private state or generated run directory';
  if (/^(agents|claude)(?:\.[^.]+)?\.md$/.test(name)
      || /^prompt_(?:maintenance|changes)(?:[._-].+)?\.md$/.test(name)
      || /^(?:.*[_-])?handoff(?:[._-].+)?\.md$/.test(name)
      || /^computer_use_(?:baseline|evaluation|assessment)\.md$/.test(name)
      || /^implementation[-_]plan(?:[._-].+)?\.md$/.test(name)) return 'local instructions or internal process document';
  if ((/^\.env(?:\..*)?$/.test(name) && name !== '.env.example')
      || /^\.credentials(?:\..*)?$/.test(name)
      || /^(?:auth|credentials|tokens|cookies|storage[-_]state)\.json$/.test(name)) return 'private authentication state';
  if (/\.log(?:\.\d+)?$/.test(name) || name === '.ds_store') return 'local log or OS artifact';
  return null;
}

function checkPaths(paths, label, current = true) {
  const violations = [...new Set(paths)].map(path => ({path, reason: reasonFor(path, current)})).filter(row => row.reason);
  if (violations.length) throw Error(`${label} contains forbidden public files:\n${violations.map(row => `  ${row.path}: ${row.reason}`).join('\n')}`);
  return paths.length;
}

function git(cwd, args) {
  return execFileSync('git', args, {cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
}

function gitPaths(cwd, ref) {
  // Host builds live inside work/ but have no repository of their own. Do not scan the parent index.
  let top;
  try { top = git(cwd, ['rev-parse', '--show-toplevel']).trim(); }
  catch (error) {
    if (error.status === 128 && String(error.stderr).includes('not a git repository') && !ref) return null;
    throw error;
  }
  // Git and Node may return different casing or 8.3 spellings for the same Windows directory.
  const identity = path => {
    const value = realpathSync.native(path);
    return process.platform === 'win32' ? value.toLowerCase() : value;
  };
  if (identity(top) !== identity(cwd)) {
    if (ref) throw Error('Reference checks require the repository root');
    return null;
  }
  const revision = ref ? git(cwd, ['rev-parse', '--verify', '--end-of-options', ref]).trim() : null;
  return git(cwd, revision ? ['ls-tree', '-r', '--name-only', '-z', revision] : ['ls-files', '--cached', '-z']).split('\0').filter(Boolean);
}

function packagePaths(cwd) {
  const packed = JSON.parse(pnpm(['--config.ignore-scripts=true', 'pack', '--dry-run', '--json'], {
    cwd, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
  }));
  if (!Array.isArray(packed?.files)) throw Error('pnpm did not return one package file list');
  return packed.files.map(file => file.path);
}

function checkHistory(cwd, ref) {
  if (git(cwd, ['rev-parse', '--is-shallow-repository']).trim() === 'true') throw Error('Public history checks require a full clone (fetch-depth: 0).');
  const commit = git(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  const commits = git(cwd, ['rev-list', commit]).trim().split('\n').filter(Boolean);
  const paths = new Set();
  // Enumerate each tree: object-list deduplication can hide a forbidden path sharing an allowed blob.
  for (const revision of commits) for (const path of git(cwd, ['ls-tree', '-r', '--name-only', '-z', revision]).split('\0').filter(Boolean)) paths.add(path);
  checkPaths([...paths], `Git history ${ref}`, false);
  return `${commits.length} reachable commits`;
}

function check(cwd, ref) {
  const tracked = gitPaths(cwd, ref);
  const counts = [];
  if (tracked) counts.push(`${checkPaths(tracked, ref ? `Git ${ref}` : 'Git index')} Git files`);
  if (tracked && !ref) {
    let head;
    try { head = git(cwd, ['rev-parse', '--verify', 'HEAD']).trim(); }
    catch (error) { if (error.status !== 128) throw error; }
    if (head) counts.push(checkHistory(cwd, 'HEAD'));
  }
  // --ref checks only that historical tree. A current npm manifest cannot represent a historical build.
  if (!ref) counts.push(`${checkPaths(packagePaths(cwd), 'npm package')} package files`);
  return counts.join(', ');
}

function selfTest() {
  for (const path of ['AGENTS.md', 'nested/CLAUDE.md', 'PROMPT_CHANGES.md', 'docs/implementation-plan.md',
    'COMPUTER_USE_HANDOFF.md', 'WINDOWS_HANDOFF.md', '.codegraph/index.db', 'codegraph.json',
    'docs/resource-research.md', 'docs/images/asset.prompt.txt', 'work/state.json', 'node_modules/a/index.js',
    '.env.production', '.credentials.json', 'auth.json', 'test-results/output.json', 'run.log']) {
    assert.ok(reasonFor(path), `Must reject ${path}`);
  }
  for (const path of ['test/secret-parser.test.mjs', 'test/fixtures/synthetic-auth.mjs', '.env.example',
    'skills/intelligent-ui/SKILL.md', 'docs/release-1.0.0.md', 'docs/marketplace-submissions.md', 'src/logger.mjs']) {
    assert.equal(reasonFor(path), null, `Must allow ${path}`);
  }
  const fixture = mkdtempSync(join(tmpdir(), 'iui-public-gate-'));
  try {
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({name: 'iui-public-gate-fixture', version: '1.0.0', files: ['src', 'docs'], scripts: {prepack: 'node -e "process.exit(99)"'}}));
    mkdirSync(join(fixture, 'src')); writeFileSync(join(fixture, 'src', 'index.mjs'), 'export {};\n');
    mkdirSync(join(fixture, 'docs')); writeFileSync(join(fixture, 'docs', 'release.md'), '# Release\n');
    assert.match(check(fixture), /package files/); // No .git, and the failing prepack must never run.
    git(fixture, ['init', '--quiet']); git(fixture, ['add', 'package.json', 'src', 'docs']);
    writeFileSync(join(fixture, 'AGENTS.md'), '# Private\n'); git(fixture, ['add', 'AGENTS.md']);
    assert.throws(() => check(fixture), /Git index contains forbidden.*\n  AGENTS.md/s, 'The staged private file must be rejected');
    const nestedBuild = join(fixture, 'work', 'host-build'); mkdirSync(nestedBuild, {recursive: true});
    writeFileSync(join(nestedBuild, 'package.json'), JSON.stringify({name: 'iui-nested-build-fixture', version: '1.0.0'}));
    assert.match(check(nestedBuild), /^\d+ package files$/); // A build nested in a repository must not inspect its parent.
    git(fixture, ['rm', '--cached', '--quiet', 'AGENTS.md']);
    assert.match(check(fixture), /Git files/); // Ignored/untracked local notes are not public candidates.
    const cleanTree = git(fixture, ['write-tree']).trim();
    writeFileSync(join(fixture, 'docs', 'implementation-plan.md'), '# Private\n');
    assert.throws(() => check(fixture), /npm package contains forbidden.*implementation-plan/s, 'The packed internal plan must be rejected');
    git(fixture, ['add', 'docs/implementation-plan.md']);
    const tree = git(fixture, ['write-tree']).trim();
    assert.throws(() => check(fixture, tree), /Git .* contains forbidden.*implementation-plan/s, 'The referenced private tree must be rejected');
    const commitArgs = ['-c', 'user.name=Public Gate Test', '-c', 'user.email=public-gate@example.invalid', 'commit-tree'];
    const privateCommit = git(fixture, [...commitArgs, tree, '-m', 'Private fixture']).trim();
    const cleanCommit = git(fixture, [...commitArgs, cleanTree, '-p', privateCommit, '-m', 'Remove private fixture']).trim();
    assert.throws(() => checkHistory(fixture, cleanCommit), /Git history .* contains forbidden.*implementation-plan/s, 'A private ancestor must be rejected');
  } finally { rmSync(fixture, {recursive: true, force: true}); }
  console.log('Public file gate self-test passed (staged files, package files, historical tree and ancestry, no Git, no lifecycle scripts).');
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-test') selfTest();
  else if (!args.length) console.log(`Public file gate passed: ${check(root)}.`);
  else if (args.length === 2 && args[0] === '--ref') console.log(`Public file gate passed: ${check(root, args[1])}.`);
  else if (args.length === 2 && args[0] === '--archive') {
    const paths = execFileSync('tar', ['-tzf', resolve(args[1])], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).split('\n').filter(Boolean);
    if (paths.some(path => !path.startsWith('package/') || path.split('/').includes('..') || path.startsWith('/'))) throw Error('Invalid package archive path');
    console.log(`Public file gate passed: ${checkPaths(paths.map(path => path.slice(8)), 'release archive')} archive files.`);
  }
  else if (args.length === 2 && args[0] === '--history') {
    gitPaths(root, args[1]); // Verify that this script is operating at the requested repository root.
    console.log(`Public file gate passed: ${checkHistory(root, args[1])}.`);
  }
  else throw Error('Usage: node scripts/check-public-files.mjs [--self-test | --ref <tag-or-ref> | --history <tag-or-ref> | --archive <tgz>]');
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
