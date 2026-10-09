import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { join, win32 } from 'node:path';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const ownFile = /^(?:[0-9a-f]{64}\.json|\.writer\.sqlite(?:-(?:journal|wal|shm))?|\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp)$/;
const failure = () => new Error('Unable to secure private state storage');

// The path is data in a task-specific environment variable, never PowerShell
// source. Use SID values so the ACL is independent of the Windows language.
const script = String.raw`
$ErrorActionPreference = 'Stop'
try {
  $target = [Environment]::GetEnvironmentVariable('IUI_PRIVATE_STATE_DIRECTORY')
  $item = Get-Item -LiteralPath $target -Force
  if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe directory' }
  $user = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  $administrators = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  $allowed = @($user.Value, $system.Value, $administrators.Value)
  $full = [Security.AccessControl.FileSystemRights]::FullControl
  $inherit = [Security.AccessControl.InheritanceFlags]::ObjectInherit -bor [Security.AccessControl.InheritanceFlags]::ContainerInherit
  function Assert-PrivateAcl($path, [bool]$directory) {
    $actual = Get-Acl -LiteralPath $path
    if ($actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { throw 'Unsafe owner' }
    $rules = @($actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    $currentHasFullControl = $false
    foreach ($rule in $rules) {
      if ($rule.IdentityReference.Value -notin $allowed -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { throw 'Unsafe access rule' }
      if ($rule.IdentityReference.Value -eq $user.Value -and ($rule.FileSystemRights -band $full) -eq $full -and !($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)) { $currentHasFullControl = $true }
    }
    if (!$currentHasFullControl) { throw 'Missing current user access' }
    if ($directory) {
      if (!$actual.AreAccessRulesProtected -or $actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $user.Value) { throw 'Unsafe directory ownership' }
      foreach ($sid in $allowed) {
        if (!($rules | Where-Object { $_.IdentityReference.Value -eq $sid -and ($_.FileSystemRights -band $full) -eq $full -and $_.InheritanceFlags -eq $inherit -and $_.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None -and !$_.IsInherited })) { throw 'Missing private inheritance' }
      }
    }
  }
  # Never recurse into a child directory or reparse point. Only inherited ACLs
  # of ordinary plugin files may be updated by Windows' automatic propagation.
  $children = @(Get-ChildItem -LiteralPath $target -Force)
  foreach ($child in $children) {
    if ($child.PSIsContainer -or ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $child.Name -cnotmatch '^(?:[0-9a-f]{64}\.json|\.writer\.sqlite(?:-(?:journal|wal|shm))?|\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp)$') { throw 'Unsafe storage child' }
    $old = Get-Acl -LiteralPath $child.FullName
    if ($old.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { throw 'Unsafe child owner' }
    foreach ($rule in $old.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier])) {
      if ($rule.IdentityReference.Value -notin $allowed -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { throw 'Unsafe explicit child access' }
    }
    # Protected or explicitly shared records are not repaired recursively.
    if ($old.AreAccessRulesProtected) { Assert-PrivateAcl $child.FullName $false }
  }
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  $acl.SetOwner($user)
  foreach ($sid in @($user, $system, $administrators)) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, $full, $inherit, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
  }
  Set-Acl -LiteralPath $target -AclObject $acl
  Assert-PrivateAcl $target $true
  foreach ($child in $children) { Assert-PrivateAcl $child.FullName $false }
  exit 0
} catch { exit 1 }
`;
const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

export function windowsPrivateCommand(directory, systemRoot = process.env.SystemRoot) {
  if (typeof directory !== 'string' || !win32.isAbsolute(directory) || win32.resolve(directory) !== directory || directory === win32.parse(directory).root || directory.includes('\0') || !systemRoot || !win32.isAbsolute(systemRoot)) throw failure();
  return {
    executable: win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    arguments: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript],
    options: { shell: false, windowsHide: true, timeout: 30000, maxBuffer: 65536, env: { ...process.env, IUI_PRIVATE_STATE_DIRECTORY: directory } },
  };
}

export async function secureWindowsDirectory(directory) {
  try {
    // Set-Acl can propagate to existing children, so reject unrelated files,
    // directories and alternate links before issuing the single directory write.
    for (const name of await readdir(directory)) {
      const stat = await lstat(join(directory, name));
      if (!ownFile.test(name) || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw failure();
    }
    const command = windowsPrivateCommand(directory);
    await runFile(command.executable, command.arguments, command.options);
  } catch { throw failure(); }
}
