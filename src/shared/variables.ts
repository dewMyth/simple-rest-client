import type { HttpRequestSpec, RequestBody, Auth, KeyValue } from './types';

/** Matches `{{ name }}`. Names may contain letters, digits, `_`, `-` and `.`. */
export const VARIABLE_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

export interface ResolveResult {
  text: string;
  missing: string[];
}

export function resolveText(text: string, vars: Record<string, string>): ResolveResult {
  const missing: string[] = [];
  const out = text.replace(VARIABLE_PATTERN, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name] ?? '';
    missing.push(name);
    return match;
  });
  return { text: out, missing };
}

/** Lists variable names used in `text`, in order of first appearance. */
export function findVariables(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(VARIABLE_PATTERN)) if (m[1]) names.add(m[1]);
  return [...names];
}

/** Builds a lookup map from enabled environment variables. Later duplicates win. */
export function variablesToMap(variables: KeyValue[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of variables) if (v.enabled && v.key.trim()) map[v.key.trim()] = v.value;
  return map;
}

/** Resolves variables in the URL, enabled headers, body and auth. */
export function resolveRequest(
  req: HttpRequestSpec,
  vars: Record<string, string>,
): { request: HttpRequestSpec; missing: string[] } {
  const missing = new Set<string>();
  const r = (s: string): string => {
    const res = resolveText(s, vars);
    res.missing.forEach((m) => missing.add(m));
    return res.text;
  };
  const kv = (list: KeyValue[]): KeyValue[] =>
    list.map((h) => (h.enabled ? { ...h, key: r(h.key), value: r(h.value) } : h));

  let body: RequestBody;
  switch (req.body.type) {
    case 'json':
    case 'text':
      body = { ...req.body, content: r(req.body.content) };
      break;
    case 'form':
      body = { type: 'form', fields: kv(req.body.fields) };
      break;
    case 'multipart':
      body = {
        type: 'multipart',
        fields: req.body.fields.map((f) =>
          !f.enabled
            ? f
            : f.kind === 'text'
              ? { ...f, key: r(f.key), value: r(f.value) }
              : { ...f, key: r(f.key) },
        ),
      };
      break;
    default:
      body = req.body;
  }

  let auth: Auth;
  switch (req.auth.type) {
    case 'bearer':
      auth = { type: 'bearer', token: r(req.auth.token) };
      break;
    case 'basic':
      auth = { type: 'basic', username: r(req.auth.username), password: r(req.auth.password) };
      break;
    default:
      auth = req.auth;
  }

  const request: HttpRequestSpec = {
    ...req,
    url: r(req.url),
    headers: kv(req.headers),
    body,
    auth,
  };
  return { request, missing: [...missing] };
}
