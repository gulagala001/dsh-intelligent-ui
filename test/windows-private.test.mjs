import test from 'node:test';
import assert from 'node:assert/strict';
import { windowsPrivateCommand } from '../src/host/windows-private.mjs';

test('Windows private ACL invocation treats quoted, wildcard and command-like paths only as environment data', () => {
  const plain = windowsPrivateCommand('C:\\plugin\\state', 'C:\\Windows');
  const literal = "C:\\plugin\\state [wildcards] '; $literal; $(literal)";
  const quoted = windowsPrivateCommand(literal, 'C:\\Windows');
  assert.equal(plain.executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(quoted.arguments, plain.arguments, 'dynamic paths never enter command text or arguments');
  assert.equal(quoted.options.env.IUI_PRIVATE_STATE_DIRECTORY, literal);
  assert.equal(quoted.options.shell, false);
  assert.equal(quoted.options.windowsHide, true);
  assert.ok(quoted.arguments.includes('-NoProfile') && quoted.arguments.includes('-NonInteractive'));
  assert.ok(!Buffer.from(quoted.arguments.at(-1), 'base64').toString('utf16le').includes(literal));
});

test('Windows private ACL invocation refuses volume roots, noncanonical paths and missing system PowerShell roots', () => {
  for (const path of ['state', 'C:\\', 'C:\\plugin\\..\\state', 'C:\\plugin\\state\\', 'C:\\plugin\\state\0']) assert.throws(() => windowsPrivateCommand(path, 'C:\\Windows'), /Unable to secure private state storage/);
  assert.throws(() => windowsPrivateCommand('C:\\plugin\\state', ''), /Unable to secure private state storage/);
  assert.throws(() => windowsPrivateCommand('C:\\plugin\\state', 'relative'), /Unable to secure private state storage/);
});
