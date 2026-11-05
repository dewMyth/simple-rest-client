import { settingsSchema, SCHEMA_VERSION } from '@shared/schemas';
import type { Settings } from '@shared/types';
import type { WriteQueue } from './atomicWrite';
import { readJsonFile, type ReadResult } from './jsonFile';
import type { DataPaths } from './paths';

export function defaultSettings(): Settings {
  return settingsSchema.parse({ schemaVersion: SCHEMA_VERSION }) as Settings;
}

export async function loadSettings(paths: DataPaths): Promise<ReadResult<Settings>> {
  return (await readJsonFile(
    paths.settings,
    settingsSchema,
    SCHEMA_VERSION,
  )) as ReadResult<Settings>;
}

export function saveSettings(paths: DataPaths, queue: WriteQueue, s: Settings): Promise<void> {
  return queue.write(paths.settings, JSON.stringify(s, null, 2) + '\n');
}
