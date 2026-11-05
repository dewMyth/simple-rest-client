import { historyFileSchema, SCHEMA_VERSION } from '@shared/schemas';
import type { HistoryEntry } from '@shared/types';
import type { WriteQueue } from './atomicWrite';
import { readJsonFile, type ReadResult } from './jsonFile';
import type { DataPaths } from './paths';

export { SECRET_HEADERS, stripSecrets } from '@shared/secrets';

export const HISTORY_LIMIT = 200;

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
