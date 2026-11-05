import type { Collection, RequestBody, SavedRequest, Session } from '@shared/types';
import { approveFilePath, isApprovedFilePath } from '../http/body';

function eachFileField(body: RequestBody, fn: (path: string) => string): RequestBody {
  if (body.type !== 'multipart') return body;
  return {
    type: 'multipart',
    fields: body.fields.map((f) =>
      f.kind === 'file' && f.filePath ? { ...f, filePath: fn(f.filePath) } : f,
    ),
  };
}

function mapRequest(r: SavedRequest, fn: (path: string) => string): SavedRequest {
  return r.body.type === 'multipart' ? { ...r, body: eachFileField(r.body, fn) } : r;
}

/** Approves file paths found in the app's own data files, so saved uploads work after a restart. */
export function approvePathsIn(collections: Collection[], session: Session | null): void {
  const approve = (p: string) => {
    approveFilePath(p);
    return p;
  };
  for (const c of collections) c.requests.forEach((r) => mapRequest(r, approve));
  session?.tabs.forEach((t) => mapRequest(t.request, approve));
}

/**
 * Clears multipart file paths the main process never approved. The renderer can keep paths it
 * got from the file dialog, but can't introduce new ones by writing them to disk.
 */
const clearUnapproved = (p: string) => (isApprovedFilePath(p) ? p : '');

export function sanitizeCollection(c: Collection): Collection {
  return { ...c, requests: c.requests.map((r) => mapRequest(r, clearUnapproved)) };
}

export function sanitizeSession(s: Session): Session {
  return {
    ...s,
    tabs: s.tabs.map((t) => ({ ...t, request: mapRequest(t.request, clearUnapproved) })),
  };
}
