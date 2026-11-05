import { sessionSchema, SCHEMA_VERSION } from '@shared/schemas';
import type { Session } from '@shared/types';
import type { WriteQueue } from './atomicWrite';
import { readJsonFile, type ReadResult } from './jsonFile';
import type { DataPaths } from './paths';

export async function loadSession(paths: DataPaths): Promise<ReadResult<Session>> {
  return (await readJsonFile(paths.session, sessionSchema, SCHEMA_VERSION)) as ReadResult<Session>;
}

export function saveSession(paths: DataPaths, queue: WriteQueue, s: Session): Promise<void> {
  return queue.write(paths.session, JSON.stringify(s) + '\n');
}
