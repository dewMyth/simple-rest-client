import { CollectionImportError, parseCollectionFile, uniqueName } from './collectionFile';
import {
  importPostmanCollection,
  importPostmanEnvironment,
  isPostmanCollection,
  isPostmanEnvironment,
} from './postman';
import type { Collection, Environment } from './types';

export interface ImportFileOptions {
  newId: () => string;
  /** Names already in use; imported items that clash get "Name (2)". Updated as items are added. */
  collectionNames: string[];
  environmentNames: string[];
}

export interface ImportFileResult {
  kind: 'simplerest' | 'postman-collection' | 'postman-environment';
  collections: Collection[];
  environments: Environment[];
  includesSecrets: boolean;
  /** Non-fatal notes, such as skipped Postman scripts. */
  notes: string[];
}

/** Detects the file type and imports SimpleRest collections, Postman collections or Postman environments. */
export function parseImportFile(text: string, opts: ImportFileOptions): ImportFileResult {
  let data: unknown;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw new CollectionImportError("The file isn't valid JSON.");
  }
  const envTaken = new Set(opts.environmentNames.map((n) => n.trim().toLowerCase()));
  const colTaken = new Set(opts.collectionNames.map((n) => n.trim().toLowerCase()));
  const nameEnv = (e: Environment): Environment => {
    const name = uniqueName(e.name, envTaken);
    envTaken.add(name.toLowerCase());
    opts.environmentNames.push(name);
    return { ...e, name };
  };

  if (isPostmanCollection(data)) {
    let res;
    try {
      res = importPostmanCollection(data, { newId: opts.newId });
    } catch (err) {
      throw new CollectionImportError(
        `The Postman collection couldn't be read: ${(err as Error).message}`,
      );
    }
    const name = uniqueName(res.collection.name, colTaken);
    opts.collectionNames.push(name);
    return {
      kind: 'postman-collection',
      collections: [{ ...res.collection, name }],
      environments: res.environment ? [nameEnv(res.environment)] : [],
      includesSecrets: false,
      notes: res.notes,
    };
  }

  if (isPostmanEnvironment(data)) {
    return {
      kind: 'postman-environment',
      collections: [],
      environments: [nameEnv(importPostmanEnvironment(data, { newId: opts.newId }))],
      includesSecrets: false,
      notes: [],
    };
  }

  const res = parseCollectionFile(text, { newId: opts.newId, existingNames: opts.collectionNames });
  opts.collectionNames.push(...res.collections.map((c) => c.name));
  return {
    kind: 'simplerest',
    collections: res.collections,
    environments: [],
    includesSecrets: res.includesSecrets,
    notes: [],
  };
}
