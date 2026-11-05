import type { Auth } from '@shared/types';

/** Returns the Authorization header value for `auth`, or null for none. */
export function authHeaderValue(auth: Auth): string | null {
  switch (auth.type) {
    case 'bearer':
      return auth.token ? `Bearer ${auth.token}` : null;
    case 'basic':
      return `Basic ${Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString('base64')}`;
    default:
      return null;
  }
}

/** Adds the auth header unless the user already set an explicit Authorization header. */
export function applyAuth(headers: [string, string][], auth: Auth): [string, string][] {
  if (headers.some(([n]) => n.toLowerCase() === 'authorization')) return headers;
  const value = authHeaderValue(auth);
  return value ? [...headers, ['Authorization', value]] : headers;
}
