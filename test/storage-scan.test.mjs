import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { StateStorage, sourceHash, LIMITS } from '../src/host/storage.mjs';

const source = 'root = Text("quota scan")\n';
const input = () => ({ session: 'scan-session', block: '1:1:0:0', expectedRevision: 0,
  source, sourceRevision: sourceHash(source), state: { checked: true } });

async function fixture(t) {
  const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'iui-scan-'));
  const store = new StateStorage(join(root, 'state')); await store.initialize();
  t.after(async () => { await store.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, store };
}

test('failed quota scan drains its bounded reads before releasing the exclusive writer', { timeout: 10000 }, async t => {
  const { store } = await fixture(t);
  for (let index = 0; index < 40; index++) await fs.writeFile(join(store.directory, index.toString().padStart(2, '0') + '.json'), '{}');
  const lstat = fs.lstat, error = Object.assign(Error('isolated scan failure'), { code: 'EIO' });
  let release, began, active = 0, peak = 0, failed = false, complete = false;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { began = resolve; });
  let operation;
  try {
    fs.lstat = async (...args) => {
      const path = String(args[0]);
      if (dirname(path) !== store.directory || !path.endsWith('.json')) return lstat(...args);
      active++; peak = Math.max(peak, active);
      try {
        if (!failed && basename(path) === '00.json') { failed = true; throw error; }
        if (basename(path) === '01.json') { began(); await gate; }
        return await lstat(...args);
      } finally { active--; }
    }; syncBuiltinESMExports();
    operation = store.save(input());
    operation.then(() => { complete = true; }, () => { complete = true; });
    await started;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(complete, false); assert.ok(active > 0); assert.ok(peak > 1 && peak <= 16);
    await assert.rejects(new StateStorage(store.directory).save(input()), error => error.statusCode === 503);
    release(); await assert.rejects(operation, error);
    assert.equal(active, 0); assert.equal(await store.get('scan-session', '1:1:0:0'), undefined);
  } finally {
    release(); await operation?.catch(() => {}); fs.lstat = lstat; syncBuiltinESMExports();
  }
  assert.equal((await store.save(input())).revision, 1);
});

test('quota scans keep byte limits and refuse unsafe unrelated records without changing their targets', async t => {
  const { root, store } = await fixture(t), outside = join(root, 'outside'), entry = join(store.directory, 'unrelated.json');
  await fs.writeFile(outside, 'unchanged');
  for (const make of [() => fs.symlink(outside, entry), () => fs.link(outside, entry), () => fs.mkdir(entry)]) {
    await make();
    await assert.rejects(store.save(input()), /unsafe file/);
    assert.equal(await fs.readFile(outside, 'utf8'), 'unchanged');
    await fs.rm(entry, { recursive: true });
  }
  const large = await fs.open(entry, 'wx', 0o600);
  try { await large.truncate(LIMITS.totalBytes); } finally { await large.close(); }
  await assert.rejects(store.save(input()), error => error.statusCode === 507);
  assert.equal(await store.get('scan-session', '1:1:0:0'), undefined);
  await fs.unlink(entry);
  assert.equal((await store.save(input())).revision, 1);
});
