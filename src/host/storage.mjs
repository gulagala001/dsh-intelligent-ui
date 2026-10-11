import { constants } from 'node:fs';
import { mkdir, lstat, open, rename, unlink, readdir } from 'node:fs/promises';
import { resolve, parse, join, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { LIMITS as RUNTIME_LIMITS, badKey } from '../runtime/limits.mjs';
import { protocolVersion, componentsVersion, readableComponentsVersions } from '../protocol/version.mjs';
import { secureWindowsDirectory } from './windows-private.mjs';

export class StateError extends Error {
  constructor(statusCode, message, record) { super(message); this.statusCode = statusCode; this.record = record; }
}
export const sourceHash = source => createHash('sha256').update(source).digest('hex');
export const LIMITS = Object.freeze({ stateBytes: RUNTIME_LIMITS.stateBytes, sourceChars: RUNTIME_LIMITS.source, sourceBytes: RUNTIME_LIMITS.source * 4, recordBytes: 1048576, totalBytes: 52428800, records: 10000, depth: RUNTIME_LIMITS.depth, nodes: RUNTIME_LIMITS.ops });

export function identity(session, block) {
  if (typeof session !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(session)) throw new StateError(400, 'Invalid session identity');
  if (typeof block !== 'string' || !/^(?:0|[1-9]\d*):(?:0|[1-9]\d*):(?:0|[1-9]\d*):(?:0|[1-9]\d*)$/.test(block)) throw new StateError(400, 'Invalid block identity');
  const numbers = block.split(':').map(Number);
  if (!numbers.every(Number.isSafeInteger)) throw new StateError(400, 'Invalid block identity');
  return numbers;
}

export function validateState(value) {
  let count = 0;
  const visit = (item, depth) => {
    if (++count > LIMITS.nodes || depth > LIMITS.depth) throw new StateError(413, 'State structure exceeds limit');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') { if (item.length > RUNTIME_LIMITS.string) throw new StateError(413, 'State string exceeds limit'); return; }
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(item))) throw new StateError(400, 'State must contain plain JSON values');
    const entries = Object.entries(item);
    if (entries.length > (Array.isArray(item) ? RUNTIME_LIMITS.array : RUNTIME_LIMITS.stateKeys)) throw new StateError(413, 'State collection exceeds limit');
    for (const [key, child] of entries) {
      if (badKey(key) || key.length > 256) throw new StateError(400, 'Invalid state key');
      visit(child, depth + 1);
    }
  };
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new StateError(400, 'State must be an object');
  visit(value, 0);
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > LIMITS.stateBytes) throw new StateError(413, 'State exceeds limit');
  return JSON.parse(json);
}

async function safeDirectory(directory, create = false) {
  const root = parse(directory).root;
  let current = root;
  for (const part of directory.slice(root.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      stat = await lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new StateError(400, 'Storage path contains a non-directory or symbolic link');
  }
}

// SQLite's Unix advisory locks are process-scoped; opening and closing an
// unrelated descriptor to its inode can release those locks. Keep every local
// instance on one seat and never open an existing database outside SQLite.
const activeDirectories = new Set();
async function acquireLock(directory) {
  if (activeDirectories.has(directory)) throw new StateError(503, 'Storage is busy');
  activeDirectories.add(directory);
  const path = join(directory, '.writer.sqlite');
  let database, retained = false;
  try {
    let reserved;
    try {
      const reservation = await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { reserved = await reservation.stat(); } finally { await reservation.close(); }
    } catch (error) { if (error.code !== 'EEXIST') throw error; reserved = await lstat(path); }
    if (!reserved.isFile() || reserved.isSymbolicLink() || reserved.nlink !== 1 || reserved.size > 65536 || (process.platform !== 'win32' && (reserved.mode & 0o777) !== 0o600)) throw new StateError(400, 'Invalid storage lock database');
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try {
        const stat = await lstat(path + suffix);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new StateError(400, 'Unsafe storage lock path');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    database = new DatabaseSync(path);
    const actual = await lstat(path);
    if (actual.dev !== reserved.dev || actual.ino !== reserved.ino || actual.isSymbolicLink() || actual.nlink !== 1) throw new StateError(400, 'Storage lock identity changed');
    database.exec('PRAGMA busy_timeout=0; PRAGMA temp_store=MEMORY; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
    database.exec('CREATE TABLE IF NOT EXISTS writer (id INTEGER PRIMARY KEY CHECK(id=1), generation INTEGER NOT NULL); INSERT OR IGNORE INTO writer VALUES(1,0); UPDATE writer SET generation=generation+1 WHERE id=1;');
    // Keep this ordinary private inode permanently. SQLite's OS lock and hot
    // rollback journal cover every kill point, with no PID/recovery owner file.
    retained = true;
    return { close() {
      try { database.exec('COMMIT'); }
      finally { try { database.close(); } finally { activeDirectories.delete(directory); } }
    } };
  } catch (error) {
    try { database?.close(); } catch {}
    if (error.code === 'ERR_SQLITE_ERROR' && /locked|busy/i.test(error.message)) throw new StateError(503, 'Storage is busy');
    throw error;
  } finally { if (!retained) activeDirectories.delete(directory); }
}

async function cleanupAbandonedFiles(directory) {
  for (const name of await readdir(directory)) {
    if (!/^\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/.test(name)) continue;
    const path = join(directory, name);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new StateError(400, 'Unsafe abandoned storage file');
    // Only the exclusive writer can create these files. Once the OS database
    // transaction is held, a prior file cannot belong to any live writer.
    await unlink(path);
  }
}

export class StateStorage {
  #queue = Promise.resolve();
  constructor(directory) {
    if (!isAbsolute(directory) || directory.split(/[\\/]/).includes('..')) throw new StateError(400, 'Storage directory must be an absolute canonical path');
    this.directory = resolve(directory);
  }
  async initialize() {
    await safeDirectory(this.directory, true);
    if (process.platform === 'win32') {
      try { await secureWindowsDirectory(this.directory); }
      catch { throw new StateError(500, 'Unable to secure private state storage'); }
    }
  }
  path(session, block) { identity(session, block); return join(this.directory, sourceHash(`${session}\0${block}`) + '.json'); }
  async get(session, block) {
    const file = this.path(session, block);
    for (let attempt = 0; attempt < 3; attempt++) {
      await safeDirectory(this.directory);
      let handle;
      try {
        handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stat = await handle.stat();
        // An atomic save can unlink this already-open snapshot before fstat.
        // Reopen the canonical path; never relax linked-file validation or
        // parse a detached descriptor, and bound races with continuous writes.
        if (stat.isFile() && stat.nlink === 0) continue;
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > LIMITS.recordBytes) throw new StateError(413, 'Invalid stored record');
        const record = JSON.parse(await handle.readFile('utf8'));
        const fields = new Set(['protocolVersion', 'componentsVersion', 'session', 'block', 'revision', 'sourceRevision', 'source', 'state']);
        if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).some(key => !fields.has(key)) || record.session !== session || record.block !== block || record.protocolVersion !== protocolVersion || !readableComponentsVersions.includes(record.componentsVersion ?? 1) || !Number.isSafeInteger(record.revision) || record.revision < 1 || typeof record.source !== 'string' || record.source.length > LIMITS.sourceChars || sourceHash(record.source) !== record.sourceRevision) throw new StateError(500, 'Invalid stored record');
        validateState(record.state);
        record.componentsVersion ??= 1;
        return record;
      } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
      finally { await handle?.close(); }
    }
    throw new StateError(503, 'Storage is busy');
  }
  save(input, verify) {
    // Snapshot before queuing so caller mutations cannot change an approved write.
    identity(input.session, input.block);
    const state = validateState(input.state);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new StateError(400, 'Invalid expected revision');
    if (typeof input.source !== 'string' || input.source.length > LIMITS.sourceChars || Buffer.byteLength(input.source) > LIMITS.sourceBytes) throw new StateError(413, 'Invalid or oversized source');
    if (typeof input.sourceRevision !== 'string' || sourceHash(input.source) !== input.sourceRevision) throw new StateError(400, 'Source revision does not match SHA-256');
    const snapshot = { ...input, state };
    const task = this.#queue.then(() => this.#save(snapshot, verify));
    this.#queue = task.catch(() => {});
    return task;
  }
  async #save(input, verify) {
    await safeDirectory(this.directory);
    const lock = await acquireLock(this.directory);
    let temporary;
    try {
      await cleanupAbandonedFiles(this.directory);
      await verify?.(input);
      const current = await this.get(input.session, input.block);
      const sameSource = current?.source === input.source;
      if ((current?.revision ?? 0) !== input.expectedRevision) throw new StateError(409, 'State revision conflict', sameSource ? current : undefined);
      const record = { protocolVersion, componentsVersion: sameSource ? current.componentsVersion : componentsVersion, session: input.session, block: input.block, revision: (current?.revision ?? 0) + 1, sourceRevision: input.sourceRevision, source: input.source, state: input.state };
      const bytes = Buffer.from(JSON.stringify(record));
      if (bytes.length > LIMITS.recordBytes) throw new StateError(413, 'Record exceeds limit');
      let total = 0, records = 0;
      for (const name of await readdir(this.directory)) {
        if (!name.endsWith('.json')) continue;
        const stat = await lstat(join(this.directory, name));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new StateError(400, 'Storage contains an unsafe file');
        total += stat.size; records++;
      }
      const target = this.path(input.session, input.block);
      let oldSize = 0;
      try { oldSize = (await lstat(target)).size; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (total - oldSize + bytes.length > LIMITS.totalBytes || records + (current ? 0 : 1) > LIMITS.records) throw new StateError(507, 'Storage quota exceeded');
      temporary = join(this.directory, `.${randomUUID()}.tmp`);
      const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
      await safeDirectory(this.directory);
      await rename(temporary, target); temporary = undefined;
      // Directory fsync is supported by Unix; Windows may reject opening directories.
      if (process.platform !== 'win32') { const dir = await open(this.directory, constants.O_RDONLY | constants.O_NOFOLLOW); try { await dir.sync(); } finally { await dir.close(); } }
      return record;
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      lock.close();
    }
  }
  async close() { await this.#queue; }
}
