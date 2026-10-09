import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { windowsPrivateCommand } from '../src/host/windows-private.mjs';

test('Windows private ACL invocation treats quoted, wildcard and command-like paths only as environment data', () => {
  const plain = windowsPrivateCommand('C:\\plugin\\state', 'C:\\Windows');
  const literal = "C:\\plugin\\state [wildcards] '; $literal; $(literal)";
  const quoted = windowsPrivateCommand(literal, 'C:\\Windows');
  assert.equal(plain.executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(quoted.arguments, plain.arguments, 'dynamic paths never enter command text or arguments');
  assert.equal(quoted.options.env.IUI_PRIVATE_STATE_DIRECTORY, literal);
  assert.equal(quoted.options.env.PSModulePath, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules');
  assert.equal(quoted.options.shell, false);
  assert.equal(quoted.options.windowsHide, true);
  assert.ok(quoted.arguments.includes('-NoProfile') && quoted.arguments.includes('-NonInteractive'));
  assert.ok(!Buffer.from(quoted.arguments.at(-1), 'base64').toString('utf16le').includes(literal));
});

test('Windows ACL subprocess replaces inherited PS7 module paths case-insensitively without changing its parent environment', async () => {
  const moduleUrl = new URL('../src/host/windows-private.mjs', import.meta.url).href;
  const script = `import {windowsPrivateCommand} from ${JSON.stringify(moduleUrl)}; const before={...process.env}; const command=windowsPrivateCommand('C:\\\\plugin\\\\state','C:\\\\Windows'); process.stdout.write(JSON.stringify({keys:Object.keys(command.options.env).filter(key=>key.toUpperCase()==='PSMODULEPATH'),value:command.options.env.PSModulePath,unchanged:JSON.stringify(before)===JSON.stringify({...process.env})}));`;
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PSMODULEPATH') delete env[key];
  env.PSMODULEPATH = 'C:\\Program Files\\PowerShell\\7\\Modules';
  env.PSModulePath = 'C:\\unrelated-modules';
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { shell: false, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  assert.equal(code, 0, stderr);
  assert.deepEqual(JSON.parse(stdout), { keys: ['PSModulePath'], value: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules', unchanged: true });
});

test('Windows private ACL invocation refuses volume roots, noncanonical paths and missing system PowerShell roots', () => {
  for (const path of ['state', 'C:\\', 'C:\\plugin\\..\\state', 'C:\\plugin\\state\\', 'C:\\plugin\\state\0']) assert.throws(() => windowsPrivateCommand(path, 'C:\\Windows'), /Unable to secure private state storage/);
  assert.throws(() => windowsPrivateCommand('C:\\plugin\\state', ''), /Unable to secure private state storage/);
  assert.throws(() => windowsPrivateCommand('C:\\plugin\\state', 'relative'), /Unable to secure private state storage/);
});
