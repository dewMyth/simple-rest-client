import type { HttpMethod } from '@shared/types';

export const MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isRedirect(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

export interface RedirectStep {
  url: URL;
  method: HttpMethod;
  /** True when the body (and its Content-* headers) must be dropped. */
  dropBody: boolean;
  /** True when the redirect crosses origins, so credentials must be stripped. */
  crossOrigin: boolean;
}

/**
 * Computes the next hop for a redirect response.
 * - 301/302 change POST to GET and drop the body.
 * - 303 changes every method except HEAD to GET and drops the body.
 * - 307/308 keep the method and body.
 */
export function nextRedirect(
  status: number,
  method: HttpMethod,
  current: URL,
  location: string,
): RedirectStep {
  const url = new URL(location, current);
  let nextMethod = method;
  let dropBody = false;
  if (status === 303) {
    if (method !== 'HEAD') nextMethod = 'GET';
    dropBody = true;
  } else if ((status === 301 || status === 302) && method === 'POST') {
    nextMethod = 'GET';
    dropBody = true;
  }
  return { url, method: nextMethod, dropBody, crossOrigin: url.origin !== current.origin };
}

const CREDENTIAL_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);
const BODY_HEADERS = new Set(['content-type', 'content-length', 'content-encoding']);

/** Removes credential and/or body headers from a flat [name, value] list. */
export function filterHeaders(
  headers: [string, string][],
  opts: { stripCredentials: boolean; stripBody: boolean },
): [string, string][] {
  return headers.filter(([name]) => {
    const n = name.toLowerCase();
    if (opts.stripCredentials && CREDENTIAL_HEADERS.has(n)) return false;
    if (opts.stripBody && BODY_HEADERS.has(n)) return false;
    return true;
  });
}
