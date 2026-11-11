import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, globSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const commit = 'ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c';
export const cacheName = 'dsh-sdk-' + commit.slice(0, 8);
const root = fileURLToPath(new URL('../', import.meta.url));
const upstream = 'https://github.com/deepseek-ai/deepseek-harness.git';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const frozen = 'be2834e3ef72341b8874a4b8c5359957449973585f0a49bc4fb4526298bca6a7';
const clients = {
  "ui-jobs": [
    "a8604ef9338c337fa9d9fc8e89bee740faa23f0d73b72f1f499e3b36bac71724",
    {
      "JobListAction_module_css_default": "_4iHfma"
    }
  ],
  "ui-open-in-app": [
    "8d8b4a6519483402119ce2a9901f3d26bfb51b8743ed2246453b19a285277825",
    {
      "OpenTargetButton_module_css_default": "ga5fXW"
    }
  ],
  "ui-agent-team": [
    "2efa878b397a8f1674f79ec1d60fa5c4e1be86b7833766135457fe9b277da328",
    {
      "TeamDisableConfirmation_module_css_default": "rsJ0Za",
      "TeamModeToggle_module_css_default": "K527tq",
      "TeamBoard_module_css_default": "er6dGq",
      "TeamCommandRow_module_css_default": "EUBFpa"
    }
  ],
  "ui-permission-presets": [
    "99d6f706c65b8a832fd95cf2ff44b920d58f47384bc7fe5b0d0ed9d334a870ba",
    {
      "PermissionSelect_module_css_default": "SJRB_q",
      "PermissionRow_module_css_default": "_58QN-a"
    }
  ],
  "ui-workflow-run": [
    "c0f828af4c0093cc67a41eb9848992f7b322bf9a77a8d21fbce886b2c3e2b964",
    {
      "WorkflowRunPanel_module_css_default": "pKyWRG"
    }
  ]
};

function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

function pnpm(directory, args) {
  const options = { cwd: directory, stdio: 'inherit', shell: process.platform === 'win32' };
  execFileSync('npm', ['exec', '--yes', '--package=pnpm@11.28.5', '--', 'pnpm', ...args], options);
}

function link(target, path) {
  if (!existsSync(path)) symlinkSync(process.platform === 'win32' ? target : relative(dirname(path), target), path, 'junction');
  if (realpathSync(path) !== realpathSync(target)) throw new Error('SDK link points to another package: ' + path);
}

export function prepareSdk(project = root) {
  const home = resolve(root, '../.local', cacheName);
  mkdirSync(dirname(home), { recursive: true });
  if (!existsSync(home)) {
    execFileSync('git', ['clone', '--depth=1', '--branch', 'dsh-v0.2.2-rc.2', upstream, home], { stdio: 'inherit' });
  }
  if (git(home, 'rev-parse', 'HEAD') !== commit || git(home, 'status', '--porcelain', '--untracked-files=no') ||
      digest(readFileSync(join(home, 'pnpm-lock.yaml'))) !== frozen) throw new Error('Host SDK checkout or lock differs from the pinned source');
  const buildInfo = join(home, '.dsh-build/client-build-environment.json');
  if (!existsSync(buildInfo)) {
    pnpm(home, ['install', '--frozen-lockfile', '--ignore-scripts']);
    pnpm(home, ['run', 'build:artifacts', '--profile', 'official']);
  }
  if (digest(readFileSync(join(home, 'node_modules/.pnpm/lock.yaml'))) !== frozen) throw new Error('Installed host SDK lock differs from source');
  const { environment } = JSON.parse(readFileSync(buildInfo));
  if (environment.DSH_CLIENT_COMMIT_HASH !== commit.slice(0, 7) || environment.DSH_CLIENT_BUILD_PROFILE !== 'official') throw new Error('Unexpected host SDK build');
  const manifest = JSON.parse(readFileSync(join(home, 'package.json')));
  const scope = join(home, 'node_modules/@deepseek-ai');
  mkdirSync(scope, { recursive: true });
  for (const path of globSync(manifest.workspaces.map(pattern => pattern + '/package.json'), { cwd: home })) {
    const file = join(home, path);
    const { name } = JSON.parse(readFileSync(file));
    if (name?.startsWith('@deepseek-ai/')) link(dirname(file), join(home, 'node_modules', name));
  }
  // CSS Modules derives local names from the checkout path. Restore the
  // released names before comparing each complete bundle with the desktop.
  for (const [name, [hash, prefixes]] of Object.entries(clients)) {
    const file = join(home, 'packages/client', name, 'lib/client.js');
    let source = readFileSync(file, 'utf8');
    if (digest(source) === hash) continue;
    for (const [group, released] of Object.entries(prefixes)) {
      const properties = source.match(new RegExp(group + '=\\{([^}]+)\\}'))?.[1];
      const names = new Set();
      for (const [, key, value] of (properties ?? '').matchAll(/"([^"]+)":`([^`]+)`/g)) {
        if (value.endsWith('_' + key)) names.add(value.slice(0, -key.length - 1));
      }
      if (names.size !== 1) throw new Error('Unexpected CSS module in ' + name + '/' + group);
      const [prefix] = names;
      source = source.replaceAll(prefix + '_', released + '_');
    }
    if (digest(source) !== hash) throw new Error('Compiled client differs from the released host: ' + name);
    writeFileSync(file, source);
  }
  const local = resolve(project, '../.local', cacheName);
  if (local !== home) {
    mkdirSync(dirname(local), { recursive: true });
    link(realpathSync(home), local);
  }
  return home;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(prepareSdk());
