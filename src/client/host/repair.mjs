import { assertJSON, LIMITS } from '../../runtime/limits.mjs';
import { protocolVersion, componentsVersion, readableComponentsVersions } from '../../protocol/version.mjs';

// Native read limits each line to 2000 characters. Even six-character JSON
// escapes fit below that bound; joining decoded chunks preserves every code
// unit, including split surrogate pairs, without changing the source text.
const chunks = text => {
  const result = [];
  for (let offset = 0; offset < text.length; offset += 240) result.push(text.slice(offset, offset + 240));
  return result;
};

export function repairPayload(sessionId, blockId, input) {
  if (typeof input?.source !== 'string' || input.source.length > LIMITS.source || typeof input.diagnostic !== 'string') throw new Error('作品修复内容无效');
  const state = structuredClone(input.state ?? {});
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('作品设置无效');
  assertJSON(state);
  return { protocolVersion, componentsVersion: input.componentsVersion ?? componentsVersion,
    session: sessionId, block: blockId, sourceChars: input.source.length,
    instructions: "This file identifies the selected artifact. Read the entire file, continuing with read offsets if the output is truncated. Concatenate the decoded sourceChunks strings in order to recover its complete original source. stateJsonChunks contains the current local JSON settings; persistedStateJsonChunks contains verified saved JSON settings, which may not have loaded when this artifact failed to render. Preserve saved settings and apply local settings for overlapping names. Use this source as the repair target even if other artifacts have the same diagnostic. Load the required component and expression references, fix the reported problem, and preserve this artifact's functionality and applicable settings. Return the corrected interactive content in this conversation.",
    sourceChunks: chunks(input.source), stateJsonChunks: chunks(JSON.stringify(state)),
    diagnosticChunks: chunks(input.diagnostic.slice(0, 1200)) };
}

export function repairText() {
  return '请修复我选中的这份交互作品，保持原来的功能和当前设置。完整源文和错误信息见所附作品文件。';
}

export function repairSavedState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('作品已保存设置无效');
  assertJSON(state);
  return chunks(JSON.stringify(state));
}

export async function verifyRepairSource(sessionId, blockId, source, signal) {
  const response = await fetch(`intelligent-ui/api/state?session=${encodeURIComponent(sessionId)}&block=${encodeURIComponent(blockId)}`, { signal });
  if (!response.ok) throw new Error('作品源文核对失败，请重新打开后重试');
  const record = await response.json();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const sourceRevision = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  signal.throwIfAborted();
  if (record.source !== source || record.protocolVersion !== protocolVersion
    || record.sourceRevision !== sourceRevision || !readableComponentsVersions.includes(record.componentsVersion)
    || (record.session !== undefined && record.session !== sessionId) || (record.block !== undefined && record.block !== blockId)) throw new Error('作品内容或身份已变化，请重新打开后重试');
  return record;
}
