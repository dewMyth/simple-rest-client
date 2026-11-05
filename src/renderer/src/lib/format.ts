export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

export type StatusClass = 'success' | 'redirect' | 'client' | 'server' | 'info';

export function statusClass(status: number): StatusClass {
  if (status >= 500) return 'server';
  if (status >= 400) return 'client';
  if (status >= 300) return 'redirect';
  if (status >= 200) return 'success';
  return 'info';
}

export function looksLikeJson(text: string, contentType: string | null): boolean {
  const mime = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (mime === 'application/json' || mime.endsWith('+json')) return true;
  const first = text.trimStart()[0];
  return first === '{' || first === '[';
}

/**
 * Pretty-prints JSON by walking the text. Number tokens are copied character for character,
 * so integers above 2^53 keep every digit (JSON.parse + stringify would round them).
 * Returns null when the text isn't valid JSON.
 */
export function prettyJson(text: string, indent = '  '): string | null {
  if (!isValidJson(text)) return null;
  const out: string[] = [];
  let depth = 0;
  let i = 0;
  const n = text.length;
  const newline = () => '\n' + indent.repeat(depth);
  while (i < n) {
    const ch = text[i]!;
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        const c = text[j];
        if (c === '\\') j += 2;
        else if (c === '"') break;
        else j++;
      }
      out.push(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '{' || ch === '[') {
      // Keep empty containers on one line.
      let j = i + 1;
      while (j < n && /\s/.test(text[j]!)) j++;
      const close = ch === '{' ? '}' : ']';
      if (text[j] === close) {
        out.push(ch + close);
        i = j + 1;
        continue;
      }
      depth++;
      out.push(ch + newline());
      i++;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth--;
      out.push(newline() + ch);
      i++;
      continue;
    }
    if (ch === ',') {
      out.push(',' + newline());
      i++;
      continue;
    }
    if (ch === ':') {
      out.push(': ');
      i++;
      continue;
    }
    // Numbers, true, false, null: copy the token verbatim.
    let j = i;
    while (j < n && !/[\s,:{}[\]"]/.test(text[j]!)) j++;
    out.push(text.slice(i, j));
    i = j;
  }
  return out.join('');
}

function isValidJson(text: string): boolean {
  if (!text.trim()) return false;
  try {
    // Only used to validate; the parsed value is thrown away so big numbers are never rounded.
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
