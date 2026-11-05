import type { Auth, HttpRequestSpec, KeyValue } from './types';

/** Headers whose values are secrets. They're cleared in history and in exports without secrets. */
export const SECRET_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-api-key',
]);

function stripAuth(auth: Auth): Auth {
  switch (auth.type) {
    case 'bearer':
      return { type: 'bearer', token: '' };
    case 'basic':
      return { type: 'basic', username: '', password: '' };
    default:
      return auth;
  }
}

/** Removes auth values and secret header values. Keeps header names so the shape is clear. */
export function stripSecrets<T extends HttpRequestSpec>(req: T): T {
  const headers: KeyValue[] = req.headers.map((h) =>
    SECRET_HEADERS.has(h.key.trim().toLowerCase()) ? { ...h, value: '' } : h,
  );
  return { ...req, headers, auth: stripAuth(req.auth) };
}
