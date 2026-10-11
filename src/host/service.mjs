import { splitResponse } from '../protocol/split.mjs';
import { identity, LIMITS, StateError, sourceHash } from './storage.mjs';
import { protocolVersion, componentsVersion } from '../protocol/version.mjs';

/** Both tested host lines authenticate all local API callers as the operator. */
export async function verifyBlock(ctx, sessionId, block, expectedSource) {
  const [turn, step, textIndex, ordinal] = identity(sessionId, block);
  const live = ctx.sessions.get(sessionId);
  let events, handle;
  try {
    if (live) events = live.snapshotEvents();
    else {
      if (!(await ctx.sessionPersistence.stat(sessionId))) throw new StateError(404, 'Session does not exist');
      handle = await ctx.sessionPersistence.open(sessionId, 'read');
      events = (await handle.read()).events;
    }
    const matching = events.filter(event => event.type === 'assistant/message' && event.data.turn === turn && event.data.step === step);
    if (matching.length !== 1) throw new StateError(404, 'Assistant block does not exist');
    const content = matching[0].data.message.content[textIndex];
    if (content?.type !== 'text' || typeof content.text !== 'string') throw new StateError(404, 'Assistant text does not exist');
    const ui = splitResponse(content.text, { streaming: false }).find(part => part.kind === 'ui' && part.ordinal === ordinal);
    if (!ui?.complete) throw new StateError(404, 'Completed UI block does not exist');
    if (expectedSource !== undefined && ui.text !== expectedSource) throw new StateError(409, 'Source does not match the assistant block');
    return { source: ui.text, sourceRevision: sourceHash(ui.text) };
  } finally { await handle?.close(); }
}

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new StateError(415, 'Expected application/json');
  if (Number(req.headers['content-length']) > LIMITS.recordBytes) throw new StateError(413, 'Request exceeds limit');
  const chunks = []; let received = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk); received += bytes.length;
    if (received > LIMITS.recordBytes) throw new StateError(413, 'Request exceeds limit');
    chunks.push(bytes);
  }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new StateError(400, 'Invalid JSON'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StateError(400, 'Expected a JSON object');
  return input;
}

export function createApiHandler(ctx, storage, { version, hostVersion, sdkVersion }) {
  return async (req, res) => {
    try {
      const rejection = ctx.connection.requestRejection(req);
      if (rejection !== undefined) { sendJson(res, rejection, { error: rejection === 401 ? 'Authentication required' : 'Request forbidden' }); return; }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/intelligent-ui/api/health') {
        if (req.method !== 'GET') throw new StateError(405, 'Method not allowed');
        sendJson(res, 200, { version, hostVersion, sdkVersion, protocolVersion, componentsVersion, features: { statePersistence: true, localInteractions: true, nativeLoop: true } }); return;
      }
      if (url.pathname !== '/intelligent-ui/api/state') throw new StateError(404, 'Unknown endpoint');
      if (req.method === 'GET') {
        const session = url.searchParams.get('session'), block = url.searchParams.get('block');
        const original = await verifyBlock(ctx, session, block);
        const record = await storage.get(session, block);
        if (record && record.source !== original.source) {
          // Project only the verified current source. Keep the previous record
          // on disk until a user edit replaces it through the normal CAS path.
          sendJson(res, 200, { revision: record.revision, ...original, state: {}, protocolVersion, componentsVersion, persisted: false }); return;
        }
        sendJson(res, 200, record ?? { revision: 0, sourceRevision: original.sourceRevision, source: original.source, state: {}, protocolVersion, componentsVersion }); return;
      }
      if (req.method === 'POST') {
        const input = await readBody(req);
        const allowed = new Set(['session', 'block', 'expectedRevision', 'sourceRevision', 'source', 'state']);
        if (Object.keys(input).some(key => !allowed.has(key))) throw new StateError(400, 'Unknown state field');
        const record = await storage.save(input, value => verifyBlock(ctx, value.session, value.block, value.source));
        sendJson(res, 200, record); return;
      }
      throw new StateError(405, 'Method not allowed');
    } catch (error) {
      // Never disclose filesystem paths, credentials, raw persistence errors, or unverified records.
      const known = error instanceof StateError;
      sendJson(res, known ? error.statusCode : 500, { error: known ? error.message : 'State service failed', ...(known && error.record ? { record: error.record } : {}) });
    }
  };
}
