import type { HttpRequestSpec, SavedRequest } from '@shared/types';
import { useSettings } from '../stores/settings';
import { newId } from './id';

export function createRequest(overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    id: newId(),
    name: '',
    method: 'GET',
    url: '',
    disabledParams: [],
    headers: [],
    body: { type: 'none' },
    auth: { type: 'none' },
    options: { ...useSettings.getState().defaultOptions },
    ...overrides,
  };
}

export function toSpec(r: SavedRequest): HttpRequestSpec {
  return {
    method: r.method,
    url: r.url,
    headers: r.headers,
    body: r.body,
    auth: r.auth,
    options: r.options,
  };
}

/** Display name for a request: its name, else the URL path, else "Untitled". */
export function requestTitle(r: Pick<SavedRequest, 'name' | 'url'>): string {
  if (r.name.trim()) return r.name.trim();
  const url = r.url.trim();
  if (!url) return 'Untitled';
  const noScheme = url.replace(/^[a-z]+:\/\//i, '');
  return noScheme.length > 40 ? noScheme.slice(0, 40) + '…' : noScheme;
}
