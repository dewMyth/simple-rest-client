import { historyFileSchema, SCHEMA_VERSION } from '@shared/schemas';
import type { Auth, HistoryEntry, HttpRequestSpec, KeyValue } from '@shared/types';
import type { WriteQueue } from './atomicWrite';
import { readJsonFile, type ReadResult } from './jsonFile';
import type { DataPaths } from './paths';

export const HISTORY_LIMIT = 200;

/** Headers whose values are secrets and must never be written to history. */
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

/** Removes auth values and secret header values. Keeps the header names so the shape is clear. */
export function stripSecrets(req: HttpRequestSpec): HttpRequestSpec {
  const headers: KeyValue[] = req.headers.map((h) =>
    SECRET_HEADERS.has(h.key.trim().toLowerCase()) ? { ...h, value: '' } : h,
  );
  return { ...req, headers, auth: stripAuth(req.auth) };
}

export async function loadHistory(paths: DataPaths): Promise<ReadResult<HistoryEntry[]>> {
  const res = await readJsonFile(paths.history, historyFileSchema, SCHEMA_VERSION);
  return res.status === 'ok' ? { status: 'ok', value: res.value.entries } : res;
}

export function saveHistory(
  paths: DataPaths,
  queue: WriteQueue,
  entries: HistoryEntry[],
): Promise<void> {
  const file = { schemaVersion: SCHEMA_VERSION, entries: entries.slice(0, HISTORY_LIMIT) };
  return queue.write(paths.history, JSON.stringify(file) + '\n');
}
