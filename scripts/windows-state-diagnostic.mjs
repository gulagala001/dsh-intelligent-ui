import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { secureWindowsDirectory, windowsPrivateCommand } from '../src/host/windows-private.mjs';

// CI-only reproduction. There is no path/config input: every operation is on
// this script's newly-created empty fixture under the canonical OS temp root.
if (process.platform !== 'win32') throw new Error('Windows diagnostic requires an actual Windows runner');
const root = await mkdtemp(join(await realpath(tmpdir()), 'iui-acl-diagnostic-'));
const directory = join(root, 'state');
await mkdir(directory);
let failed = false;
try {
  try {
    await secureWindowsDirectory(directory);
    process.stdout.write('IUI_ACL_DIAGNOSTIC secureWindowsDirectory=passed\n');
  } catch {
    failed = true;
    process.stdout.write('IUI_ACL_DIAGNOSTIC secureWindowsDirectory=failed\n');
  }
  const command = windowsPrivateCommand(directory);
  let script = Buffer.from(command.arguments.at(-1), 'base64').toString('utf16le');
  script = "$iuiDiagnosticStage = 'start'\n" + script;
  for (const [needle, stage] of [
    ["  Import-Module", 'import-built-in-security-module'],
    ["  $item = Get-Item", 'get-directory'],
    ["  $user = [Security.Principal.WindowsIdentity]", 'current-user'],
    ["  $children = @(Get-ChildItem", 'list-children'],
    ["  $acl = [Security.AccessControl.DirectorySecurity]", 'create-directory-security'],
    ["  $acl.SetAccessRuleProtection", 'protect-acl'],
    ["  $acl.SetOwner", 'set-owner'],
    ["  foreach ($sid in @($user", 'build-rules'],
    ["  Set-Acl -LiteralPath", 'write-directory-acl'],
    ["  Assert-PrivateAcl $target", 'verify-directory-acl'],
  ]) script = script.replace(needle, `  $iuiDiagnosticStage = '${stage}'\n${needle}`);
  script = script.replace('} catch { exit 1 }', String.raw`} catch {
    [Console]::Error.WriteLine('IUI_ACL_DIAGNOSTIC stage=' + $iuiDiagnosticStage)
    [Console]::Error.WriteLine('IUI_ACL_DIAGNOSTIC type=' + $_.Exception.GetType().FullName)
    [Console]::Error.WriteLine('IUI_ACL_DIAGNOSTIC message=' + $_.Exception.Message)
    [Console]::Error.WriteLine('IUI_ACL_DIAGNOSTIC category=' + $_.FullyQualifiedErrorId)
    [Console]::Error.WriteLine('IUI_ACL_DIAGNOSTIC position=' + $_.InvocationInfo.PositionMessage)
    [Console]::Error.WriteLine('IUI_ACL_DIAGNOSTIC powershell=' + $PSVersionTable.PSVersion.ToString())
    try {
      $iuiObserved = Get-Acl -LiteralPath $target
      [Console]::Error.WriteLine('IUI_ACL_DIAGNOSTIC fixture-sddl=' + $iuiObserved.Sddl)
      [Console]::Error.WriteLine('IUI_ACL_DIAGNOSTIC fixture-protected=' + $iuiObserved.AreAccessRulesProtected)
    } catch {}
    exit 1
  }`);
  command.arguments[command.arguments.length - 1] = Buffer.from(script, 'utf16le').toString('base64');
  try {
    const result = await promisify(execFile)(command.executable, command.arguments, command.options);
    process.stdout.write('IUI_ACL_DIAGNOSTIC instrumented=passed\n');
    if (result.stderr) process.stdout.write(result.stderr);
  } catch (error) {
    failed = true;
    process.stdout.write(`IUI_ACL_DIAGNOSTIC exit=${error.code ?? 'unknown'} signal=${error.signal ?? 'none'}\n`);
    // Only this fixed fixture script's output; never dump process.env or Node's
    // error object (which includes the command and environment context).
    if (error.stderr) process.stdout.write(String(error.stderr).slice(0, 16384));
  }
} finally {
  await rm(root, { recursive: true, force: true });
  process.stdout.write('IUI_ACL_DIAGNOSTIC cleanup=passed\n');
}
if (failed) process.exitCode = 1;
