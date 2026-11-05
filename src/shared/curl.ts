import {
  DEFAULT_OPTIONS,
  HTTP_METHODS,
  type Auth,
  type HttpMethod,
  type HttpRequestSpec,
  type KeyValue,
  type MultipartField,
  type RequestBody,
} from './types';

export class CurlParseError extends Error {}

/** True when pasted text looks like a cURL command. */
export function looksLikeCurl(text: string): boolean {
  return /^\s*curl(\.exe)?\s/i.test(text);
}

/**
 * Splits a POSIX-shell command line into words. Handles single quotes, double quotes (with
 * \" \\ \$ \` escapes), $'…' ANSI-C quotes, backslash escapes, and line continuations
 * (`\` + newline, and `^` + newline from Windows cmd copies).
 */
export function tokenize(input: string): string[] {
  const words: string[] = [];
  let cur = '';
  let inWord = false;
  let i = 0;
  const s = input.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      if (inWord) {
        words.push(cur);
        cur = '';
        inWord = false;
      }
      i++;
      continue;
    }
    inWord = true;
    if (ch === "'") {
      const end = s.indexOf("'", i + 1);
      if (end === -1) throw new CurlParseError('Unclosed single quote');
      cur += s.slice(i + 1, end);
      i = end + 1;
    } else if (ch === '$' && s[i + 1] === "'") {
      i += 2;
      while (i < s.length && s[i] !== "'") {
        if (s[i] === '\\' && i + 1 < s.length) {
          const e = s[i + 1]!;
          const map: Record<string, string> = {
            n: '\n',
            t: '\t',
            r: '\r',
            '\\': '\\',
            "'": "'",
            '"': '"',
            '0': '\0',
          };
          cur += map[e] ?? e;
          i += 2;
        } else cur += s[i++];
      }
      if (s[i] !== "'") throw new CurlParseError("Unclosed $' quote");
      i++;
    } else if (ch === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length && '"\\$`\n'.includes(s[i + 1]!)) {
          cur += s[i + 1];
          i += 2;
        } else cur += s[i++];
      }
      if (s[i] !== '"') throw new CurlParseError('Unclosed double quote');
      i++;
    } else if (ch === '\\' && i + 1 < s.length) {
      cur += s[i + 1];
      i += 2;
    } else {
      cur += ch;
      i++;
    }
  }
  if (inWord) words.push(cur);
  return words;
}

let idCounter = 0;
const defaultId = () => `c${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** Decodes an x-www-form-urlencoded component, or returns null if it's malformed. */
function formDecode(s: string): string | null {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

const DEFAULT_CONTENT_TYPES: Record<string, RegExp> = {
  json: /^application\/json$/i,
  text: /^text\/plain(;\s*charset=utf-8)?$/i,
  form: /^application\/x-www-form-urlencoded$/i,
};

type Flag =
  | 'request'
  | 'header'
  | 'data'
  | 'dataUrlencode'
  | 'form'
  | 'formString'
  | 'user'
  | 'url'
  | 'userAgent'
  | 'cookie'
  | 'referer'
  | 'maxTime'
  | 'ignoredWithValue';

const VALUE_FLAGS: Record<string, Flag> = {
  '-X': 'request',
  '--request': 'request',
  '-H': 'header',
  '--header': 'header',
  '-d': 'data',
  '--data': 'data',
  '--data-raw': 'data',
  '--data-binary': 'data',
  '--data-ascii': 'data',
  '--data-urlencode': 'dataUrlencode',
  '-F': 'form',
  '--form': 'form',
  '--form-string': 'formString',
  '-u': 'user',
  '--user': 'user',
  '--url': 'url',
  '-A': 'userAgent',
  '--user-agent': 'userAgent',
  '-b': 'cookie',
  '--cookie': 'cookie',
  '-e': 'referer',
  '--referer': 'referer',
  '-m': 'maxTime',
  '--max-time': 'maxTime',
  '-o': 'ignoredWithValue',
  '--output': 'ignoredWithValue',
  '--connect-timeout': 'ignoredWithValue',
  '-w': 'ignoredWithValue',
  '--write-out': 'ignoredWithValue',
  '--retry': 'ignoredWithValue',
  '-x': 'ignoredWithValue',
  '--proxy': 'ignoredWithValue',
};

/** Single-letter flags without a value that may be combined, e.g. `-sSLk`. */
const BOOL_SHORT = new Set(['s', 'S', 'L', 'k', 'v', 'i', 'I', 'G', 'f', 'N', 'g']);

/** Parses a cURL command into a request. Throws CurlParseError when it can't. */
export function parseCurl(command: string, newId: () => string = defaultId): HttpRequestSpec {
  const words = tokenize(command.trim());
  if (!words.length || !/^curl(\.exe)?$/i.test(words[0]!))
    throw new CurlParseError('Not a cURL command');

  let method: string | null = null;
  let url: string | null = null;
  const headers: [string, string][] = [];
  const data: string[] = [];
  const formPairs: { key: string; value: string }[] = [];
  let urlencodedOnly = true;
  const multipart: MultipartField[] = [];
  let user: string | null = null;
  let follow = false;
  let insecure = false;
  let head = false;
  let get = false;
  let timeoutMs = DEFAULT_OPTIONS.timeoutMs;

  const take = (flag: Flag, value: string) => {
    switch (flag) {
      case 'request':
        method = value.toUpperCase();
        break;
      case 'header': {
        const idx = value.indexOf(':');
        if (idx > 0) headers.push([value.slice(0, idx).trim(), value.slice(idx + 1).trim()]);
        break;
      }
      case 'data':
        data.push(value.startsWith('@') ? '' : value);
        urlencodedOnly = false;
        break;
      case 'dataUrlencode': {
        // name=content → name=urlencode(content). A bare value is encoded entirely.
        const eq = value.indexOf('=');
        if (eq > 0) formPairs.push({ key: value.slice(0, eq), value: value.slice(eq + 1) });
        else formPairs.push({ key: eq === 0 ? value.slice(1) : value, value: '' });
        break;
      }
      case 'form':
      case 'formString': {
        const eq = value.indexOf('=');
        if (eq <= 0) break;
        const key = value.slice(0, eq);
        const v = value.slice(eq + 1);
        if (flag === 'form' && v.startsWith('@')) {
          // File paths can't be imported; the user picks the file again.
          multipart.push({ id: newId(), kind: 'file', key, filePath: '', enabled: true });
        } else {
          multipart.push({
            id: newId(),
            kind: 'text',
            key,
            value: flag === 'form' ? v.replace(/;type=[^;]*$/, '') : v,
            enabled: true,
          });
        }
        break;
      }
      case 'user':
        user = value;
        break;
      case 'url':
        url = value;
        break;
      case 'userAgent':
        headers.push(['User-Agent', value]);
        break;
      case 'cookie':
        if (value.includes('=')) headers.push(['Cookie', value]);
        break;
      case 'referer':
        headers.push(['Referer', value]);
        break;
      case 'maxTime': {
        const secs = Number(value);
        if (Number.isFinite(secs) && secs >= 0) timeoutMs = Math.round(secs * 1000);
        break;
      }
      case 'ignoredWithValue':
        break;
    }
  };

  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    if (w.startsWith('--')) {
      const eq = w.indexOf('=');
      const name = eq === -1 ? w : w.slice(0, eq);
      const flag = VALUE_FLAGS[name];
      if (flag) {
        const value = eq === -1 ? words[++i] : w.slice(eq + 1);
        if (value === undefined) throw new CurlParseError(`${name} needs a value`);
        take(flag, value);
        continue;
      }
      if (name === '--location' || name === '--location-trusted') follow = true;
      else if (name === '--insecure') insecure = true;
      else if (name === '--head') head = true;
      else if (name === '--get') get = true;
      // Other boolean long flags (--compressed, --silent, …) don't change the request.
      continue;
    }
    if (w.startsWith('-') && w.length > 1) {
      const short = w.slice(0, 2);
      const flag = VALUE_FLAGS[short];
      if (flag) {
        const value = w.length > 2 ? w.slice(2) : words[++i];
        if (value === undefined) throw new CurlParseError(`${short} needs a value`);
        take(flag, value);
        continue;
      }
      for (const c of w.slice(1)) {
        if (c === 'L') follow = true;
        else if (c === 'k') insecure = true;
        else if (c === 'I') head = true;
        else if (c === 'G') get = true;
        else if (!BOOL_SHORT.has(c)) break;
      }
      continue;
    }
    if (url === null) url = w;
  }

  if (!url) throw new CurlParseError('No URL found in the cURL command');

  // Headers → KeyValue rows; pull Content-Type and Bearer auth out for body/auth detection.
  let contentType: string | null = null;
  let auth: Auth = { type: 'none' };
  const headerRows: KeyValue[] = [];
  for (const [key, value] of headers) {
    const lower = key.toLowerCase();
    if (lower === 'content-type') contentType = value;
    if (lower === 'authorization' && auth.type === 'none' && /^Bearer\s+/i.test(value)) {
      auth = { type: 'bearer', token: value.replace(/^Bearer\s+/i, '') };
      continue;
    }
    headerRows.push({ id: newId(), key, value, enabled: true });
  }
  if (user !== null) {
    const u: string = user;
    const idx = u.indexOf(':');
    auth = {
      type: 'basic',
      username: idx === -1 ? u : u.slice(0, idx),
      password: idx === -1 ? '' : u.slice(idx + 1),
    };
  }

  let body: RequestBody = { type: 'none' };
  const raw = data.join('&');
  if (get) {
    const extra = [
      raw,
      ...formPairs.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`),
    ]
      .filter(Boolean)
      .join('&');
    if (extra) url += (url.includes('?') ? '&' : '?') + extra;
  } else if (multipart.length) {
    body = { type: 'multipart', fields: multipart };
  } else if (data.length || formPairs.length) {
    const ct = (contentType ?? '').toLowerCase();
    const trimmed = raw.trim();
    if (ct.includes('json') || (!contentType && !formPairs.length && /^[[{]/.test(trimmed))) {
      body = { type: 'json', content: raw };
    } else if (
      (!contentType || DEFAULT_CONTENT_TYPES['form']!.test(contentType)) &&
      (urlencodedOnly || allFormEncoded(raw))
    ) {
      const fields: KeyValue[] = [];
      for (const part of raw.split('&').filter(Boolean)) {
        const eq = part.indexOf('=');
        fields.push({
          id: newId(),
          key: formDecode(eq === -1 ? part : part.slice(0, eq)) ?? '',
          value: eq === -1 ? '' : (formDecode(part.slice(eq + 1)) ?? ''),
          enabled: true,
        });
      }
      for (const p of formPairs)
        fields.push({ id: newId(), key: p.key, value: p.value, enabled: true });
      body = { type: 'form', fields };
    } else {
      body = { type: 'text', content: raw };
    }
  }

  // Drop a Content-Type header that the body type would add anyway.
  const defaultCt = body.type in DEFAULT_CONTENT_TYPES ? DEFAULT_CONTENT_TYPES[body.type] : null;
  const finalHeaders = headerRows.filter(
    (h) => !(h.key.toLowerCase() === 'content-type' && defaultCt?.test(h.value.trim())),
  );

  const m: string = method ?? (head ? 'HEAD' : body.type !== 'none' ? 'POST' : 'GET');
  if (!(HTTP_METHODS as readonly string[]).includes(m))
    throw new CurlParseError(`Unsupported method ${m}`);

  return {
    method: m as HttpMethod,
    url,
    headers: finalHeaders,
    body,
    auth,
    options: { timeoutMs, followRedirects: follow, verifyTls: !insecure },
  };
}

function allFormEncoded(raw: string): boolean {
  return raw.split('&').every((p) => /^[^=&]+(=[^&]*)?$/.test(p) && formDecode(p) !== null);
}

/** Quotes a word for POSIX shells. Plain words stay bare; everything else is single-quoted. */
export function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

const CT_FOR_BODY: Partial<Record<RequestBody['type'], string>> = {
  json: 'application/json',
  text: 'text/plain; charset=utf-8',
};

/** Builds a shell-safe cURL command (POSIX quoting) for the request. */
export function toCurl(req: HttpRequestSpec): string {
  const parts: string[] = ['curl'];
  const hasBody = req.body.type !== 'none';
  // curl infers GET without data and POST with data; spell out everything else.
  if (req.method === 'HEAD') parts.push('-I');
  else if (!(req.method === 'GET' && !hasBody) && !(req.method === 'POST' && hasBody))
    parts.push('-X', req.method);
  parts.push(shellQuote(req.url));

  const headers = req.headers.filter((h) => h.enabled && h.key.trim());
  const hasCt = headers.some((h) => h.key.trim().toLowerCase() === 'content-type');
  const hasAuthHeader = headers.some((h) => h.key.trim().toLowerCase() === 'authorization');
  for (const h of headers) parts.push('-H', shellQuote(`${h.key.trim()}: ${h.value}`));
  const defaultCt = CT_FOR_BODY[req.body.type];
  if (defaultCt && !hasCt) parts.push('-H', shellQuote(`Content-Type: ${defaultCt}`));

  if (!hasAuthHeader) {
    if (req.auth.type === 'bearer' && req.auth.token)
      parts.push('-H', shellQuote(`Authorization: Bearer ${req.auth.token}`));
    if (req.auth.type === 'basic')
      parts.push('-u', shellQuote(`${req.auth.username}:${req.auth.password}`));
  }

  switch (req.body.type) {
    case 'json':
    case 'text':
      parts.push('--data-raw', shellQuote(req.body.content));
      break;
    case 'form':
      for (const f of req.body.fields)
        if (f.enabled && f.key) parts.push('--data-urlencode', shellQuote(`${f.key}=${f.value}`));
      break;
    case 'multipart':
      for (const f of req.body.fields) {
        if (!f.enabled || !f.key) continue;
        if (f.kind === 'text') parts.push('--form-string', shellQuote(`${f.key}=${f.value}`));
        else if (f.filePath) parts.push('-F', shellQuote(`${f.key}=@${f.filePath}`));
      }
      break;
    default:
      break;
  }

  if (req.options.followRedirects) parts.push('-L');
  if (!req.options.verifyTls) parts.push('-k');
  if (req.options.timeoutMs !== DEFAULT_OPTIONS.timeoutMs)
    parts.push('--max-time', String(req.options.timeoutMs / 1000));

  return parts.join(' ');
}
