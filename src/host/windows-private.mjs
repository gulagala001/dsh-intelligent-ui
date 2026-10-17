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
  # PowerShell 7 -> Node -> Windows PowerShell otherwise inherits PS7 module
  # paths. Pin this built-in module instead of autoloading an incompatible one.
  Import-Module ([IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Security', 'Microsoft.PowerShell.Security.psd1')) -ErrorAction Stop
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
  $rootAcl = Get-Acl -LiteralPath $target
  $rootOwner = $rootAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if ($rootOwner -notin $allowed) { throw 'Unsafe directory owner' }
  $rootGroup = $rootAcl.GetGroup([Security.Principal.SecurityIdentifier]).Value
  $rootRules = @($rootAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
  foreach ($rule in $rootAcl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier])) {
    if ($rule.IdentityReference.Value -notin $allowed -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { throw 'Unsafe explicit directory access' }
  }
  $privateRoot = $rootAcl.AreAccessRulesProtected -and $rootOwner -eq $user.Value
  foreach ($rule in $rootRules) {
    if ($rule.IdentityReference.Value -notin $allowed -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { $privateRoot = $false }
  }
  foreach ($sid in $allowed) {
    if (!($rootRules | Where-Object { $_.IdentityReference.Value -eq $sid -and ($_.FileSystemRights -band $full) -eq $full -and $_.InheritanceFlags -eq $inherit -and $_.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None -and !$_.IsInherited })) { $privateRoot = $false }
  }
  if (!$privateRoot) {
    # Set-Acl may persist sections that a fresh descriptor never loaded.
    # Write exactly DACL (+ Owner only when it changes); never Group or SACL.
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class IuiPrivateAclWriter {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
  private static extern uint SetNamedSecurityInfoW(string name, int type, uint info, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
  [DllImport("advapi32.dll", SetLastError=true)]
  private static extern bool GetSecurityDescriptorOwner(IntPtr descriptor, out IntPtr owner, out bool defaulted);
  [DllImport("advapi32.dll", SetLastError=true)]
  private static extern bool GetSecurityDescriptorDacl(IntPtr descriptor, out bool present, out IntPtr dacl, out bool defaulted);
  public static void Write(string path, byte[] descriptor, bool ownerChanged) {
    IntPtr memory=Marshal.AllocHGlobal(descriptor.Length);
    try {
      Marshal.Copy(descriptor, 0, memory, descriptor.Length);
      IntPtr owner, dacl; bool ownerDefaulted, present, daclDefaulted;
      if (!GetSecurityDescriptorOwner(memory, out owner, out ownerDefaulted) ||
          !GetSecurityDescriptorDacl(memory, out present, out dacl, out daclDefaulted))
        throw new Win32Exception(Marshal.GetLastWin32Error());
      if (!present || dacl == IntPtr.Zero || owner == IntPtr.Zero)
        throw new InvalidOperationException("Incomplete private descriptor");
      uint information=0x80000004U; // PROTECTED_DACL_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION
      if (ownerChanged) information |= 0x1U; // OWNER_SECURITY_INFORMATION
      uint error=SetNamedSecurityInfoW(path, 1, information, ownerChanged ? owner : IntPtr.Zero, IntPtr.Zero, dacl, IntPtr.Zero);
      if (error != 0) throw new Win32Exception((int)error);
    } finally { Marshal.FreeHGlobal(memory); }
  }
}
'@
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetOwner($user)
    foreach ($sid in @($user, $system, $administrators)) {
      $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, $full, $inherit, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
    }
    [IuiPrivateAclWriter]::Write($target, $acl.GetSecurityDescriptorBinaryForm(), $rootOwner -ne $user.Value)
  }
  Assert-PrivateAcl $target $true
  foreach ($child in $children) { Assert-PrivateAcl $child.FullName $false }
  if ((Get-Acl -LiteralPath $target).GetGroup([Security.Principal.SecurityIdentifier]).Value -ne $rootGroup) { throw 'Directory group changed' }
  exit 0
} catch { exit 1 }
`;
const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

export function windowsPrivateCommand(directory, systemRoot = process.env.SystemRoot) {
  if (typeof directory !== 'string' || !win32.isAbsolute(directory) || win32.resolve(directory) !== directory || directory === win32.parse(directory).root || directory.includes('\0') || !systemRoot || !win32.isAbsolute(systemRoot)) throw failure();
  const powershellRoot = win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0');
  const env = { ...process.env };
  // Node chooses the lexicographically first casing of a Windows env key.
  // Remove ambient variants before adding these child-only values.
  for (const key of Object.keys(env)) if (['PSMODULEPATH', 'IUI_PRIVATE_STATE_DIRECTORY'].includes(key.toUpperCase())) delete env[key];
  env.PSModulePath = win32.join(powershellRoot, 'Modules');
  env.IUI_PRIVATE_STATE_DIRECTORY = directory;
  return {
    executable: win32.join(powershellRoot, 'powershell.exe'),
    arguments: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript],
    options: { shell: false, windowsHide: true, timeout: 30000, maxBuffer: 65536, env },
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
