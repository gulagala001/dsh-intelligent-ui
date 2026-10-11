import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, realpath, rm, readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { StateStorage, sourceHash } from '../../src/host/storage.mjs';
import { createApiHandler, verifyBlock } from '../../src/host/service.mjs';
import { installSkill, skillContent, skillDirectory, renderCatalog, groups } from '../../src/host/skill.mjs';
import * as Prompt from '../../src/host/prompt.mjs';
import * as IntelligentUI from '../../src/index.mjs';

// Explicit SDK root selects the actual packaged host; missing SDKs fail tests.
const sdkRoot = resolve(process.env.IUI_TEST_SDK_ROOT ?? '.');
const requireSdk = createRequire(join(sdkRoot, 'package.json'));
async function sdk(name) {
  let path;
  try { path = requireSdk.resolve(name); }
  catch (error) {
    if (!process.env.IUI_TEST_SDK_ROOT) throw error;
    const packageName = name.slice(name.lastIndexOf('/') + 1);
    const pnpm = join(sdkRoot, 'node_modules', '.pnpm');
    const entries = (await readdir(pnpm)).filter(entry => entry.startsWith(`@deepseek-ai+${packageName}@`));
    assert.equal(entries.length, 1, `one aligned SDK package required: ${name}`);
    path = createRequire(join(pnpm, entries[0], 'node_modules', name, 'package.json')).resolve(name);
  }
  return import(pathToFileURL(path));
}
const [{ Context }, SessionSDK, LlmSDK, Connection, SkillSDK, SystemPromptSDK, ScopeSDK, Persistence, WebServer] = await Promise.all(['@deepseek-ai/cordis', '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-scope', '@deepseek-ai/dsh-session-persistence-jsonl', '@deepseek-ai/dsh-host-webserver'].map(sdk));

function response() {
  return { headers: {}, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value ? JSON.parse(value) : undefined; } };
}
async function request(handler, cookie, method = 'GET', url = '/intelligent-ui/api/health', body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method; req.url = url;
  req.headers = { host: 'localhost:8111', ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers };
  const res = response(); await handler(req, res); return res;
}
async function fixture(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'iui-native-')); t.after(() => rm(root, { recursive: true, force: true }));
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  let secret;
  ctx.provide('credentials', { async modifyRecord(_key, callback) { const update = await callback(secret); if (update) secret = update; return secret; } });
  await ctx.plugin(Connection);
  await ctx.plugin(SessionSDK.SessionStore);
  await ctx.plugin(Persistence.default, { root: join(root, 'sessions'), compression: 'none' });
  const cookieResponse = { headers: {}, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end() {}, setHeader(key, value) { this.headers[key] = value; } };
  const authUrl = new URL(ctx.connection.authenticatedUrl('http://localhost:8111/'));
  ctx.connection.authorizeIndex({ method: 'GET', url: authUrl.pathname + authUrl.search, headers: { host: 'localhost:8111' } }, cookieResponse);
  const cookie = cookieResponse.headers['set-cookie']?.split(';')[0]; assert.ok(cookie, 'native launch token must mint a cookie');
  const session = ctx.sessions.create('native-session', { meta: { cwd: root } });
  const source = 'root = Text("Native state")\n';
  session.append('turn/start', { turn: 1 });
  session.append('step/start', { turn: 1, step: 1 });
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: LlmSDK.createMessage({ role: 'assistant', content: [{ type: 'text', text: 'intro\n```openui\n' + source + '```\nend' }], source: { kind: 'model', provider: 'fixture', model: 'fixture' } }) }, { surfaceOp: 'append' });
  session.append('step/end', { turn: 1, step: 1 });
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
  const store = new StateStorage(join(root, 'state')); await store.initialize();
  return { ctx, session, store, cookie, source, root, handler: createApiHandler(ctx, store, { version: 'fixture', hostVersion: 'actual-test-sdk' }) };
}

async function changedSourceFixture(t) {
  const value = await fixture(t);
  const block = '1:1:0:0';
  const input = { session: value.session.id, block, source: value.source, sourceRevision: sourceHash(value.source), expectedRevision: 0, state: { privateOldValue: 'source-A-only' } };
  const saved = await request(value.handler, value.cookie, 'POST', '/intelligent-ui/api/state', input);
  assert.equal(saved.status, 200);
  const path = value.store.path(value.session.id, block);
  // Model an existing v3 document independently of the current writer contract.
  await writeFile(path, JSON.stringify({ ...saved.body, componentsVersion: 3 }));
  const source = 'root = Text("Replacement source B")\n';
  const events = value.session.snapshotEvents().map(event => event.type !== 'assistant/message' ? event : {
    ...event, data: { ...event.data, message: LlmSDK.createMessage({ role: 'assistant', content: [{ type: 'text', text: 'intro\n```openui\n' + source + '```\nend' }], source: { kind: 'model', provider: 'fixture', model: 'fixture' } }) },
  });
  // Replay the host's current snapshot with the same session/block identity.
  const currentSession = SessionSDK.Session.create(value.session.id, events, value.session.header);
  let sessionReads = 0;
  const ctx = { connection: value.ctx.connection, sessionPersistence: value.ctx.sessionPersistence, sessions: { get(id) { sessionReads++; return id === currentSession.id ? currentSession : value.ctx.sessions.get(id); } } };
  const handler = createApiHandler(ctx, value.store, { version: 'fixture', hostVersion: 'actual-test-sdk' });
  const disk = await readFile(path);
  return { ...value, handler, source, previousSource: value.source, input, path, disk, ctx, sessionReads: () => sessionReads, url: `/intelligent-ui/api/state?session=${value.session.id}&block=${block}` };
}

test('native Cookie, Host and Origin authentication gate every endpoint before session access', async t => {
  const { handler, cookie } = await fixture(t);
  assert.equal((await request(handler)).status, 401);
  assert.equal((await request(handler, cookie, 'GET', '/intelligent-ui/api/health')).status, 200);
  assert.equal((await request(handler, cookie, 'GET', '/intelligent-ui/api/health', undefined, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(handler, cookie, 'GET', '/intelligent-ui/api/health', undefined, { host: 'evil.example' })).status, 403);
  assert.equal((await request(handler, cookie, 'GET', '/intelligent-ui/api/state?session=missing&block=1:1:0:0')).status, 404);
});

test('native assistant text identity controls CAS and cold JSONL session restoration', async t => {
  const { handler, cookie, source, ctx, session } = await fixture(t);
  const url = '/intelligent-ui/api/state?session=native-session&block=1:1:0:0';
  assert.equal((await request(handler, cookie, 'GET', url)).body.revision, 0);
  const input = { session: session.id, block: '1:1:0:0', source, sourceRevision: sourceHash(source), expectedRevision: 0, state: { count: 5 } };
  assert.equal((await request(handler, cookie, 'POST', '/intelligent-ui/api/state', input)).body.revision, 1);
  assert.equal((await request(handler, cookie, 'POST', '/intelligent-ui/api/state', input)).status, 409);
  const forged = { ...input, expectedRevision: 1, source: source + ' ', sourceRevision: sourceHash(source + ' ') };
  assert.equal((await request(handler, cookie, 'POST', '/intelligent-ui/api/state', forged)).status, 409);
  for (const block of ['0:1:0:0', '1:0:0:0', '1:1:1:0', '1:1:0:1']) assert.equal((await request(handler, cookie, 'GET', '/intelligent-ui/api/state?session=native-session&block=' + block)).status, 404);
  const handle = await ctx.sessionPersistence.create(session.header); await handle.append(session.snapshotEvents()); await handle.flush(); await handle.close();
  const coldCtx = { sessions: { get: () => undefined }, sessionPersistence: ctx.sessionPersistence };
  assert.equal((await verifyBlock(coldCtx, session.id, input.block)).source, source);
  assert.deepEqual((await request(handler, cookie, 'GET', url)).body.state, { count: 5 });
});

test('native HTTP source replacement projects the current block without mutating legacy disk state', async t => {
  const { handler, cookie, source, previousSource, store, path, disk, ctx, session, sessionReads, url } = await changedSourceFixture(t);
  assert.equal((await request(handler, undefined, 'GET', url)).status, 401);
  assert.equal((await request(handler, cookie, 'GET', url, undefined, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(handler, cookie, 'GET', url, undefined, { host: 'evil.example' })).status, 403);
  assert.equal(sessionReads(), 0, 'authentication rejects callers before looking up the changed session');
  assert.equal((await verifyBlock(ctx, session.id, '1:1:0:0')).source, source, 'the host owns B before stored A is read');
  const beforeStat = await lstat(path);
  const beforeEntries = await readdir(store.directory);
  const fileMetadata = async () => Promise.all(beforeEntries.map(async name => {
    const stat = await lstat(join(store.directory, name));
    return { name, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  }));
  const beforeFiles = await fileMetadata();
  for (let attempt = 0; attempt < 2; attempt++) {
    const projected = await request(handler, cookie, 'GET', url);
    assert.equal(projected.status, 200);
    assert.equal(projected.body.revision, 1);
    assert.equal(projected.body.source, source);
    assert.equal(projected.body.sourceRevision, sourceHash(source));
    assert.deepEqual(projected.body.state, {});
    assert.equal(projected.body.protocolVersion, 1);
    assert.equal(projected.body.componentsVersion, 4);
    assert.equal(projected.body.persisted, false);
    assert.ok(!JSON.stringify(projected.body).includes(previousSource));
    assert.ok(!JSON.stringify(projected.body).includes('source-A-only'));
  }
  assert.deepEqual(await readFile(path), disk, 'GET preserves the exact legacy record bytes');
  const afterStat = await lstat(path);
  assert.deepEqual({ ino: afterStat.ino, size: afterStat.size, mtimeMs: afterStat.mtimeMs, ctimeMs: afterStat.ctimeMs }, { ino: beforeStat.ino, size: beforeStat.size, mtimeMs: beforeStat.mtimeMs, ctimeMs: beforeStat.ctimeMs }, 'GET does not replace or touch the stored record');
  assert.deepEqual(await readdir(store.directory), beforeEntries, 'GET creates no persistence files');
  assert.deepEqual(await fileMetadata(), beforeFiles, 'GET does not touch any persistence file or acquire a writer transaction');
});

test('native HTTP source replacement rejects old ownership and hides cross-source CAS records', async t => {
  const { handler, cookie, source, input, path, disk } = await changedSourceFixture(t);
  const oldWrite = await request(handler, cookie, 'POST', '/intelligent-ui/api/state', { ...input, expectedRevision: 1 });
  assert.equal(oldWrite.status, 409);
  assert.equal(oldWrite.body.record, undefined, 'old A cannot receive a merge record after ownership changes');
  assert.deepEqual(await readFile(path), disk, 'rejected old-source write preserves the record');
  const conflict = await request(handler, cookie, 'POST', '/intelligent-ui/api/state', { ...input, source, sourceRevision: sourceHash(source), state: { count: 7 } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.record, undefined, 'CAS on B must not expose the obsolete A record');
  assert.ok(!JSON.stringify(conflict.body).includes('source-A-only'));
  assert.deepEqual(await readFile(path), disk, 'rejected cross-source CAS preserves the record');
});

test('native HTTP source replacement saves B with the old revision and current component contract', async t => {
  const { handler, cookie, source, input, path, url } = await changedSourceFixture(t);
  const next = { ...input, expectedRevision: 1, source, sourceRevision: sourceHash(source), state: { count: 7 } };
  const saved = await request(handler, cookie, 'POST', '/intelligent-ui/api/state', next);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, 2);
  assert.equal(saved.body.source, source);
  assert.equal(saved.body.sourceRevision, sourceHash(source));
  assert.equal(saved.body.componentsVersion, 4, 'a changed source starts the current component contract');
  assert.deepEqual(saved.body.state, { count: 7 });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), saved.body);
  const loaded = await request(handler, cookie, 'GET', url);
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.body, saved.body);
  const conflict = await request(handler, cookie, 'POST', '/intelligent-ui/api/state', next);
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.body.record, saved.body, 'same-source conflicts retain the valid merge record');
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), saved.body);
});

test('native skill summary stays short, resources are generated, and dedicated prompt leaves global assembly unchanged', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  await ctx.plugin(SkillSDK.default); await ctx.plugin(SystemPromptSDK.default);
  installSkill(ctx);
  const list = await ctx.skills.list(); assert.equal(list.length, 1); assert.ok(list[0].description.length < 160); assert.equal(list[0].name, 'intelligent-ui');
  const loaded = await ctx.skills.get('intelligent-ui'); assert.equal(loaded.content, skillContent()); assert.ok(loaded.resourceBase.path.replaceAll('\\','/').endsWith('skills/intelligent-ui/'));
  assert.ok(loaded.content.length < 10000); assert.ok(loaded.content.includes('Calculator('));
  for (const group of groups) assert.ok(renderCatalog(group).includes('Schema:'));
  const before = await ctx.systemPrompt.assemble();
  const key = { agent: 'interactive' }; const scope = ScopeSDK.createScope(ctx, key); const fiber = await scope.ctx.plugin(Prompt);
  assert.deepEqual(await ctx.systemPrompt.assemble(), before);
  const section=(await ctx.systemPrompt.assemble({ scope: key })).sections.find(section => section.name === 'intelligent-ui:answers');
  assert.ok(section);
  assert.ok(section.text.includes(JSON.stringify(skillDirectory)), 'the dedicated prompt supplies its installed resource base independently of cwd');
  assert.ok((await readFile(join(skillDirectory,'references/data.md'),'utf8')).includes('Chart('));
  await fiber.dispose(); assert.deepEqual(await ctx.systemPrompt.assemble({ scope: key }), before);
});

test('native server plugin mounts authenticated HTTP routes and fully removes routes and skill on disposal', async t => {
  const { ctx, root } = await fixture(t);
  await ctx.plugin(SkillSDK.default);
  await ctx.plugin(WebServer.WebServer, { host: '127.0.0.1', port: 0 });
  // Cordis stores the native homePath capability as a function, not a string.
  ctx.provide('dshHomePath', () => root);
  const fiber = await ctx.plugin(IntelligentUI);
  const port = ctx.webServer.port;
  const authUrl = new URL(ctx.connection.authenticatedUrl(`http://127.0.0.1:${port}/`));
  const cookieResponse = { headers: {}, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end() {} };
  ctx.connection.authorizeIndex({ method: 'GET', url: authUrl.pathname + authUrl.search, headers: { host: `127.0.0.1:${port}` } }, cookieResponse);
  const cookie = cookieResponse.headers['set-cookie'].split(';')[0];
  const url = `http://127.0.0.1:${port}/intelligent-ui/api/health`;
  assert.equal((await fetch(url)).status, 401);
  const health = await fetch(url, { headers: { cookie } }); assert.equal(health.status, 200); assert.equal((await health.json()).protocolVersion, 1);
  assert.ok((await readdir(join(root, 'intelligent-ui'))).includes('state'));
  assert.equal((await ctx.skills.list()).length, 1);
  await fiber.dispose();
  assert.equal((await fetch(url, { headers: { cookie } })).status, 404);
  assert.deepEqual(await ctx.skills.list(), []);
});
