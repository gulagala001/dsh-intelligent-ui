import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat, writeFile, symlink, readFile, readdir, realpath, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { StateStorage, sourceHash, validateState, identity, LIMITS } from '../src/host/storage.mjs';

const runFile = promisify(execFile);
async function windowsAclScript(script, paths) {
  const powershellRoot = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (['PSMODULEPATH', 'IUI_TEST_ACL_PATHS'].includes(key.toUpperCase())) delete env[key];
  env.PSModulePath = join(powershellRoot, 'Modules');
  env.IUI_TEST_ACL_PATHS = JSON.stringify(paths);
  const fixedScript = "Import-Module ([IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Security', 'Microsoft.PowerShell.Security.psd1')) -ErrorAction Stop\n" + script;
  const { stdout } = await runFile(join(powershellRoot, 'powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(fixedScript, 'utf16le').toString('base64')], {
    shell: false, windowsHide: true, timeout: 30000, env,
  });
  return stdout;
}
async function windowsAcls(paths) {
  return JSON.parse(await windowsAclScript(String.raw`
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    $items = @()
    foreach ($path in (ConvertFrom-Json $env:IUI_TEST_ACL_PATHS)) {
      $acl = Get-Acl -LiteralPath $path
      $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | ForEach-Object {
        @{ sid = $_.IdentityReference.Value; rights = [int]$_.FileSystemRights; type = $_.AccessControlType.ToString(); inherited = $_.IsInherited; inheritance = [int]$_.InheritanceFlags; propagation = [int]$_.PropagationFlags }
      })
      $items += @{ owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value; protected = $acl.AreAccessRulesProtected; sddl = $acl.Sddl; rules = $rules }
    }
    @{ user = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; items = $items } | ConvertTo-Json -Depth 6 -Compress
  `, paths));
}
function assertPrivateWindowsAcl(snapshot, index, { directory = false, newFile = true } = {}) {
  const acl = snapshot.items[index];
  const allowed = new Set([snapshot.user, 'S-1-5-18', 'S-1-5-32-544']);
  const broad = new Set(['S-1-1-0', 'S-1-5-32-545', 'S-1-5-11']); // Everyone, Users, Authenticated Users
  assert.ok(allowed.has(acl.owner), 'actual owner is the current user, SYSTEM or Administrators');
  assert.ok(acl.rules.every(rule => !broad.has(rule.sid) && allowed.has(rule.sid) && rule.type === 'Allow'), 'actual ACL grants no access to broad or unrelated principals');
  for (const sid of allowed) assert.ok(acl.rules.some(rule => rule.sid === sid && (rule.rights & 0x1f01ff) === 0x1f01ff && !(rule.propagation & 2)), `actual ACL gives ${sid} full control`);
  if (directory) {
    assert.equal(acl.owner, snapshot.user);
    assert.equal(acl.protected, true);
    assert.ok(acl.rules.every(rule => !rule.inherited && rule.inheritance === 3 && rule.propagation === 0), 'directory protects private OI/CI rules from parent inheritance');
  } else if (newFile) assert.ok(acl.rules.every(rule => rule.inherited), 'new plugin files inherit the private directory ACL');
}

async function fixture(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'iui-storage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStorage(join(root, 'state'));
  await store.initialize();
  return { root, store };
}
const source = 'root = Text("原始材料")\n';
const input = patch => ({ session: 'session-A', block: '1:2:0:0', expectedRevision: 0, source, sourceRevision: sourceHash(source), state: { checked: true }, ...patch });

test('CAS serializes concurrent writes, preserves the winning state across restart and uses private files', async t => {
  const { store } = await fixture(t);
  const [a, b] = await Promise.allSettled([store.save(input()), store.save(input({ state: { checked: false } }))]);
  assert.equal(a.status, 'fulfilled'); assert.equal(a.value.revision, 1);
  assert.equal(b.status, 'rejected'); assert.equal(b.reason.statusCode, 409); assert.deepEqual(b.reason.record.state, { checked: true });
  const restarted = new StateStorage(store.directory);
  await restarted.initialize();
  assert.equal((await restarted.get('session-A', '1:2:0:0')).source, source);
  const recordPath = store.path('session-A', '1:2:0:0'), lockPath = join(store.directory, '.writer.sqlite');
  if (process.platform === 'win32') {
    const acls = await windowsAcls([store.directory, recordPath, lockPath]);
    assertPrivateWindowsAcl(acls, 0, { directory: true }); assertPrivateWindowsAcl(acls, 1); assertPrivateWindowsAcl(acls, 2);
  } else {
    assert.equal((await stat(recordPath)).mode & 0o777, 0o600);
    assert.equal((await stat(lockPath)).mode & 0o777, 0o600);
  }
  assert.deepEqual((await readdir(store.directory)).sort(), ['.writer.sqlite', basename(recordPath)].sort());
  assert.equal((await restarted.save(input({ expectedRevision: 1, state: { checked: false } }))).revision, 2);
  assert.deepEqual((await restarted.get('session-A', '1:2:0:0')).state, { checked: false }, 'private permissions still permit CAS read and write after restart');
});

test('initialization makes legacy inherited records private without changing their parent ACL or data', async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'iui-legacy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new StateStorage(join(root, "state [quoted] '; $literal"));
  await mkdir(store.directory, { mode: 0o700 });
  const recordPath = store.path('session-A', '1:2:0:0');
  const record = { protocolVersion: 1, session: 'session-A', block: '1:2:0:0', revision: 1, source, sourceRevision: sourceHash(source), state: { checked: true } };
  await writeFile(recordPath, JSON.stringify(record), { mode: 0o600 });
  let parentBefore;
  if (process.platform === 'win32') {
    await windowsAclScript(String.raw`
      $ErrorActionPreference = 'Stop'
      $path = @(ConvertFrom-Json $env:IUI_TEST_ACL_PATHS)[0]
      $acl = Get-Acl -LiteralPath $path
      $sid = [Security.Principal.SecurityIdentifier]::new('S-1-1-0')
      $flags = [Security.AccessControl.InheritanceFlags]::ObjectInherit -bor [Security.AccessControl.InheritanceFlags]::ContainerInherit
      $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::ReadAndExecute, $flags, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow))
      Set-Acl -LiteralPath $path -AclObject $acl
    `, [root]);
    const old = await windowsAcls([root, recordPath]);
    parentBefore = old.items[0].sddl;
    assert.ok(old.items[1].rules.some(rule => rule.sid === 'S-1-1-0' && rule.inherited), 'legacy record starts with a real broad inherited ACL');
  }
  await store.initialize();
  assert.equal(await readFile(recordPath, 'utf8'), JSON.stringify(record));
  assert.deepEqual(await store.get('session-A', '1:2:0:0'), {...record,componentsVersion:1});
  if (process.platform === 'win32') {
    const secured = await windowsAcls([root, store.directory, recordPath]);
    assert.equal(secured.items[0].sddl, parentBefore, 'parent ACL is unchanged');
    assertPrivateWindowsAcl(secured, 1, { directory: true });
    // Windows keeps directly applied, already-private ACEs on the old inode.
    // Every owner/SID/right is still checked; only new files require all ACEs
    // to be inherited from the protected plugin directory.
    assertPrivateWindowsAcl(secured, 2, { newFile: false });
    t.diagnostic(`Legacy fixture private Windows DACL: ${secured.items[2].sddl}`);
  } else assert.equal((await stat(recordPath)).mode & 0o777, 0o600);
  assert.equal((await store.save(input({ expectedRevision: 1 }))).revision, 2);
  if (process.platform === 'win32') {
    const replaced = await windowsAcls([recordPath]);
    assertPrivateWindowsAcl(replaced, 0);
    t.diagnostic(`CAS replacement inherited Windows DACL: ${replaced.items[0].sddl}`);
  }
});

test('Windows initialization refuses explicitly shared legacy records without repairing child ACLs', async t => {
  const { store } = await fixture(t);
  await store.save(input());
  const recordPath = store.path('session-A', '1:2:0:0');
  const before = await readFile(recordPath, 'utf8');
  if (process.platform === 'win32') {
    await windowsAclScript(String.raw`
      $ErrorActionPreference = 'Stop'
      $path = @(ConvertFrom-Json $env:IUI_TEST_ACL_PATHS)[0]
      $acl = Get-Acl -LiteralPath $path
      $acl.SetAccessRuleProtection($true, $true)
      $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'), [Security.AccessControl.FileSystemRights]::Read, [Security.AccessControl.AccessControlType]::Allow))
      Set-Acl -LiteralPath $path -AclObject $acl
    `, [recordPath]);
    const explicit = await windowsAcls([store.directory, recordPath]);
    await assert.rejects(new StateStorage(store.directory).initialize(), error => error.statusCode === 500 && error.message === 'Unable to secure private state storage');
    const after = await windowsAcls([store.directory, recordPath]);
    assert.deepEqual(after, explicit, 'refusal leaves directory and explicit child ACLs unchanged');
  } else await new StateStorage(store.directory).initialize();
  assert.equal(await readFile(recordPath, 'utf8'), before);
});

test('Windows ACL initialization refuses unrelated entries and alternate links before any permission write', async t => {
  const { root, store } = await fixture(t);
  const target = join(root, 'outside.json'); await writeFile(target, 'private target');
  const before = process.platform === 'win32' ? await windowsAcls([root, store.directory, target]) : undefined;
  const unsafe = [
    { path: join(store.directory, 'unrelated.txt'), create: path => writeFile(path, 'unrelated') },
    { path: join(store.directory, 'child'), create: path => mkdir(path) },
    { path: store.path('session-A', '1:2:0:0'), create: path => symlink(target, path) },
    { path: store.path('session-A', '1:2:0:0'), create: path => link(target, path) },
  ];
  for (const entry of unsafe) {
    await entry.create(entry.path);
    if (process.platform === 'win32') {
      await assert.rejects(new StateStorage(store.directory).initialize(), error => error.statusCode === 500 && error.message === 'Unable to secure private state storage');
      assert.deepEqual(await windowsAcls([root, store.directory, target]), before, 'refusal preserves outside and parent ACLs');
    } else await new StateStorage(store.directory).initialize();
    await rm(entry.path, { recursive: true });
  }
  assert.equal(await readFile(target, 'utf8'), 'private target');
});

test('forged source hash and failed ownership check cannot mutate an existing record', async t => {
  const { store } = await fixture(t); await store.save(input());
  assert.throws(() => store.save(input({ sourceRevision: '0'.repeat(64) })), /SHA-256/);
  await assert.rejects(store.save(input()), error => error.statusCode === 409);
  await assert.rejects(store.save(input({ expectedRevision: 1, state: {} }), async () => { throw Error('missing assistant block'); }), /missing assistant/);
  assert.equal((await store.get('session-A', '1:2:0:0')).revision, 1);
});

test('records retain their component contract and refuse unknown versions without overwriting source', async t => {
  const {store}=await fixture(t);const saved=await store.save(input());assert.equal(saved.componentsVersion,3);
  const path=store.path('session-A','1:2:0:0');
  for(const componentsVersion of [1,2]){
    const legacy={...saved,componentsVersion};await writeFile(path,JSON.stringify(legacy));
    assert.equal((await store.get('session-A','1:2:0:0')).componentsVersion,componentsVersion);
    assert.equal((await store.save(input({expectedRevision:1}))).componentsVersion,componentsVersion,'editing an existing legacy document retains its contract');
  }
  const newer={...saved,componentsVersion:4};await writeFile(path,JSON.stringify(newer));
  await assert.rejects(store.get('session-A','1:2:0:0'),/Invalid stored record/);
  await assert.rejects(store.save(input({expectedRevision:1})),/Invalid stored record/);
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')),newer);
});

test('state and identity validation reject traversal, unsafe object keys and bounded-data violations', () => {
  for (const id of ['../private', '/private', 'a\\b', 'a'.repeat(161)]) assert.throws(() => identity(id, '1:2:0:0'));
  for (const block of ['1:2:-1:0', '01:2:0:0', '1:2:0:9007199254740992', '1:2:0:0/../../x']) assert.throws(() => identity('s', block));
  assert.throws(() => validateState(JSON.parse('{"__proto__":{"polluted":true}}')));
  assert.throws(() => validateState({ constructor: 'x' }));
  assert.throws(() => validateState({ date: new Date() }));
  assert.throws(() => validateState({ number: Infinity }));
  assert.throws(() => validateState({ huge: 'a'.repeat(LIMITS.stateBytes) }));
  let deep = {}; for (let i = 0; i < LIMITS.depth + 5; i++) deep = { child: deep };
  assert.throws(() => validateState(deep), /structure/);
  assert.throws(() => new StateStorage('/tmp/../escape'));
});

test('symlink roots and records are refused without changing their targets', async t => {
  const { root, store } = await fixture(t);
  const target = join(root, 'private.json'); await writeFile(target, '{"private":"do not overwrite"}');
  await symlink(target, store.path('session-A', '1:2:0:0'));
  await assert.rejects(store.get('session-A', '1:2:0:0'));
  await assert.rejects(store.save(input()));
  assert.equal(await readFile(target, 'utf8'), '{"private":"do not overwrite"}');
  await symlink(store.directory, join(root, 'alias'));
  await assert.rejects(new StateStorage(join(root, 'alias', 'child')).initialize(), /symbolic link/);
});

test('separate storage instances respect a held writer lock and recover after verification failure', async t => {
  const { store } = await fixture(t);
  let release, began;
  const started = new Promise(resolve => { began = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const write = store.save(input(), async () => { began(); await blocked; throw Error('refused'); });
  await started;
  const other = new StateStorage(store.directory);
  await assert.rejects(other.save(input()), error => error.statusCode === 503);
  const script = `import {StateStorage} from ${JSON.stringify(new URL('../src/host/storage.mjs', import.meta.url).href)};try{await new StateStorage(process.argv[1]).save(JSON.parse(process.argv[2]));process.stdout.write('CHILD_ACQUIRED');process.exitCode=1;}catch(error){process.stdout.write(JSON.stringify({status:error.statusCode}));}`;
  const contender = spawn(process.execPath, ['--input-type=module', '-e', script, store.directory, JSON.stringify(input())], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; contender.stdout.on('data', bytes => { output += bytes; });
  assert.equal(await new Promise((resolve, reject) => { contender.once('exit', resolve); contender.once('error', reject); }), 0);
  assert.deepEqual(JSON.parse(output), { status: 503 }, 'a rejected same-process contender must never release the actual OS lock');
  release(); await assert.rejects(write, /refused/);
  assert.equal((await other.save(input())).revision, 1);
});

test('an actual killed writer leaves previous durable state intact and a new process can recover its lock', async t => {
  const { store } = await fixture(t); await store.save(input());
  const script = `import {StateStorage} from ${JSON.stringify(new URL('../src/host/storage.mjs', import.meta.url).href)}; const store = new StateStorage(process.argv[1]); await store.save(JSON.parse(process.argv[2]), async () => { process.stdout.write('locked\\n'); setInterval(() => {}, 1000); await new Promise(() => {}); });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, store.directory, JSON.stringify(input({ expectedRevision: 1, state: { checked: false } }))], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL'));
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(Error(`writer exited before lock: ${code}`))); });
  const exited = new Promise(resolve => child.once('exit', (_code, signal) => resolve(signal))); child.kill('SIGKILL'); assert.equal(await exited, 'SIGKILL');
  assert.deepEqual((await store.get('session-A', '1:2:0:0')).state, { checked: true });
  assert.equal((await new StateStorage(store.directory).save(input({ expectedRevision: 1, state: { checked: false } }))).revision, 2);
});

test('killing a recovering writer cannot strand a second lock and orphan temporary files are reclaimed exclusively', async t => {
  const { store } = await fixture(t); await store.save(input());
  const moduleUrl = new URL('../src/host/storage.mjs', import.meta.url).href;
  const start = async filename => {
    const script = `import {StateStorage} from ${JSON.stringify(moduleUrl)}; import {writeFile} from 'node:fs/promises'; import {join} from 'node:path'; const store=new StateStorage(process.argv[1]); await store.save(JSON.parse(process.argv[2]), async()=>{ await writeFile(join(store.directory,process.argv[3]),'abandoned',{mode:0o600});process.stdout.write('exclusive-after-recovery\\n');setInterval(()=>{},1000);await new Promise(()=>{}); });`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, store.directory, JSON.stringify(input({ expectedRevision: 1 })), filename], { stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(() => child.kill('SIGKILL'));
    await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(Error(`recovery writer exited before transaction: ${code}`))); });
    return child;
  };
  const kill = async child => { const exited = new Promise(resolve => child.once('exit', (_code, signal) => resolve(signal))); child.kill('SIGKILL'); assert.equal(await exited, 'SIGKILL'); };
  const firstTmp = '.11111111-1111-1111-1111-111111111111.tmp';
  const first = await start(firstTmp); await kill(first);
  assert.ok((await stat(join(store.directory, '.writer.sqlite-journal'))).size > 0, 'real killed SQLite transaction leaves a hot rollback journal');
  const secondTmp = '.22222222-2222-2222-2222-222222222222.tmp';
  const recovering = await start(secondTmp);
  assert.ok(!(await readdir(store.directory)).includes(firstTmp), 'recovering writer holds exclusive transaction before reclaiming the orphan');
  await assert.rejects(new StateStorage(store.directory).save(input({ expectedRevision: 1 })), error => error.statusCode === 503);
  await kill(recovering);
  // A third real process must recover the recovered-but-killed owner, without
  // relying on PID metadata, deleting a live owner's lock inode, or timeout.
  const completeScript = `import {StateStorage} from ${JSON.stringify(moduleUrl)};const s=new StateStorage(process.argv[1]);const before=await s.get('session-A','1:2:0:0');const after=await s.save(JSON.parse(process.argv[2]));process.stdout.write(JSON.stringify({before:before.revision,after:after.revision}));`;
  const complete = spawn(process.execPath, ['--input-type=module', '-e', completeScript, store.directory, JSON.stringify(input({ expectedRevision: 1 }))], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; complete.stdout.on('data', bytes => { stdout += bytes; }); complete.stderr.on('data', bytes => { stderr += bytes; });
  const code = await new Promise((resolve, reject) => { complete.once('exit', resolve); complete.once('error', reject); });
  assert.equal(code, 0, stderr); assert.deepEqual(JSON.parse(stdout), { before: 1, after: 2 });
  assert.ok(!(await readdir(store.directory)).some(name => name.endsWith('.tmp')));
  assert.ok(!(await readdir(store.directory)).includes('.writer.sqlite-journal'));
});

test('SQLite lock and journal symlinks cannot redirect lock writes into another file', async t => {
  const { root, store } = await fixture(t);
  const target = join(root, 'outside'); await writeFile(target, 'private target');
  const database = join(store.directory, '.writer.sqlite');
  await symlink(target, database);
  await assert.rejects(store.save(input()));
  assert.equal(await readFile(target, 'utf8'), 'private target');
  await rm(database); await store.save(input());
  await symlink(target, database + '-journal');
  await assert.rejects(store.save(input({ expectedRevision: 1 })));
  assert.equal(await readFile(target, 'utf8'), 'private target');
  assert.equal((await store.get('session-A', '1:2:0:0')).revision, 1);
});
