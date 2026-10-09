import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile, symlink, readFile, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { StateStorage, sourceHash, validateState, identity, LIMITS } from '../src/host/storage.mjs';

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
  assert.equal((await restarted.get('session-A', '1:2:0:0')).source, source);
  assert.equal((await stat(store.path('session-A', '1:2:0:0'))).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(store.directory), ['.writer.sqlite', store.path('session-A', '1:2:0:0').split('/').at(-1)]);
  assert.equal((await stat(join(store.directory, '.writer.sqlite'))).mode & 0o777, 0o600);
});

test('forged source hash and failed ownership check cannot mutate an existing record', async t => {
  const { store } = await fixture(t); await store.save(input());
  assert.throws(() => store.save(input({ sourceRevision: '0'.repeat(64) })), /SHA-256/);
  await assert.rejects(store.save(input()), error => error.statusCode === 409);
  await assert.rejects(store.save(input({ expectedRevision: 1, state: {} }), async () => { throw Error('missing assistant block'); }), /missing assistant/);
  assert.equal((await store.get('session-A', '1:2:0:0')).revision, 1);
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
