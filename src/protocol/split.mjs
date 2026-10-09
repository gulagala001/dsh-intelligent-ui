/** Split only top-level Markdown UI fences. Raw Markdown and source are preserved. */
export function splitResponse(text, { streaming = false } = {}) {
  text = String(text ?? '');
  const result = []; let position = 0, plainStart = 0, code = null, ordinal = 0;
  const pushText = end => { if (end > plainStart) result.push({ kind: 'text', text: text.slice(plainStart, end), start: plainStart, complete: true }); };
  for (const line of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!line[0]) continue;
    const raw = line[0], value = raw.replace(/\r?\n$/, ''), start = line.index;
    const fence = value.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
    if (!code && fence) {
      const language = fence[2].trim().toLowerCase();
      const ui = language === 'openui' || language === 'intelligent-ui';
      code = { marker: fence[1][0], count: fence[1].length, ui, start, contentStart: start + raw.length };
      if (ui) pushText(start);
    } else if (code && fence && fence[1][0] === code.marker && fence[1].length >= code.count && !fence[2].trim()) {
      if (code.ui) {
        result.push({ kind: 'ui', text: text.slice(code.contentStart, start), ordinal: ordinal++, complete: true, start: code.start });
        plainStart = start + raw.length;
      }
      code = null;
    }
    position = start + raw.length;
  }
  if (code?.ui) {
    result.push({ kind: 'ui', text: text.slice(code.contentStart), ordinal: ordinal++, complete: false, start: code.start });
    plainStart = text.length;
  }
  // An unfinished UI fence header stays a loading shell, never a runnable program.
  if (!code && streaming) {
    const last = text.slice(text.lastIndexOf('\n') + 1);
    if (/^ {0,3}`{3,}(?:openui|intelligent-ui)\s*$/.test(last)) {
      const start = text.length - last.length;
      if (plainStart <= start) { pushText(start); result.push({ kind: 'ui', text: '', ordinal: ordinal++, complete: false, start }); plainStart = text.length; }
    }
  }
  pushText(Math.max(position, text.length));
  return result;
}
