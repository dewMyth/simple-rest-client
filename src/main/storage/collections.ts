import { readdir, rm } from 'node:fs/promises';
import type { z } from 'zod';
import { collectionSchema, environmentSchema, SCHEMA_VERSION } from '@shared/schemas';
import type { Collection, Environment } from '@shared/types';
import { readJsonFile } from './jsonFile';
import { isSafeId, type DataPaths } from './paths';
import type { WriteQueue } from './atomicWrite';

interface Loaded<T> {
  items: T[];
  warnings: string[];
}

/** Loads every `<id>.json` in a folder. Corrupt files are set aside and reported. */
async function loadDir<S extends z.ZodType<{ id: string }>>(
  dir: string,
  schema: S,
  label: string,
): Promise<Loaded<z.infer<S>>> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { items: [], warnings: [] };
  }
  const items: z.infer<S>[] = [];
  const warnings: string[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith('.json') || name.startsWith('.') || name.includes('.corrupt-')) continue;
    const id = name.slice(0, -5);
    if (!isSafeId(id)) continue;
    const res = await readJsonFile(`${dir}/${name}`, schema, SCHEMA_VERSION);
    if (res.status === 'ok') {
      // The file name is the source of truth for the id.
      items.push(res.value.id === id ? res.value : { ...res.value, id });
    } else if (res.status === 'corrupt') {
      warnings.push(
        `A ${label} file (${name}) couldn't be read: ${res.reason}. ` +
          (res.movedTo
            ? `It was kept as ${res.movedTo.split(/[\\/]/).pop()}.`
            : 'It was left in place.'),
      );
    }
  }
  return { items, warnings };
}

export function loadCollections(paths: DataPaths): Promise<Loaded<Collection>> {
  return loadDir(paths.collectionsDir, collectionSchema, 'collection') as Promise<
    Loaded<Collection>
  >;
}

export function loadEnvironments(paths: DataPaths): Promise<Loaded<Environment>> {
  return loadDir(paths.environmentsDir, environmentSchema, 'environment') as Promise<
    Loaded<Environment>
  >;
}

export function saveCollection(paths: DataPaths, queue: WriteQueue, c: Collection): Promise<void> {
  return queue.write(paths.collection(c.id), JSON.stringify(c, null, 2) + '\n');
}

export function saveEnvironment(
  paths: DataPaths,
  queue: WriteQueue,
  e: Environment,
): Promise<void> {
  return queue.write(paths.environment(e.id), JSON.stringify(e, null, 2) + '\n');
}

/** Deletes a collection the user chose to delete. */
export function deleteCollection(paths: DataPaths, queue: WriteQueue, id: string): Promise<void> {
  const file = paths.collection(id);
  return queue.after(file, () => rm(file, { force: true }));
}

export function deleteEnvironment(paths: DataPaths, queue: WriteQueue, id: string): Promise<void> {
  const file = paths.environment(id);
  return queue.after(file, () => rm(file, { force: true }));
}
