/**
 * The JSON file format for exporting and importing collections.
 *
 * {
 *   "format": "simplerest-collection",
 *   "formatVersion": 1,
 *   "exportedAt": "2026-11-05T10:00:00.000Z",
 *   "exportedBy": "SimpleRest/0.1.0",
 *   "includesSecrets": false,
 *   "collections": [ <Collection> ]
 * }
 *
 * Import also accepts a bare collection object, such as a file copied from the data folder.
 */
import { z } from 'zod';
import { collectionSchema } from './schemas';
import { stripSecrets } from './secrets';
import type { Collection, KeyValue, RequestBody, SavedRequest } from './types';

export const COLLECTION_FILE_FORMAT = 'simplerest-collection';
export const COLLECTION_FILE_VERSION = 1;
/** Imports larger than this are refused before parsing. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export interface CollectionFile {
  format: typeof COLLECTION_FILE_FORMAT;
  formatVersion: number;
  exportedAt: string;
  exportedBy: string;
  includesSecrets: boolean;
  collections: Collection[];
}

export class CollectionImportError extends Error {}

/** Multipart file paths are machine-specific and can reveal folder names, so they're never exported. */
function clearFilePaths(body: RequestBody): RequestBody {
  if (body.type !== 'multipart') return body;
  return {
    type: 'multipart',
    fields: body.fields.map((f) => (f.kind === 'file' ? { ...f, filePath: '' } : f)),
  };
}

export function buildCollectionFile(
  collection: Collection,
  opts: { includeSecrets: boolean; exportedBy: string; now?: Date },
): CollectionFile {
  const requests = collection.requests.map((r) => {
    const cleaned: SavedRequest = { ...r, body: clearFilePaths(r.body) };
    return opts.includeSecrets ? cleaned : stripSecrets(cleaned);
  });
  return {
    format: COLLECTION_FILE_FORMAT,
    formatVersion: COLLECTION_FILE_VERSION,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    exportedBy: opts.exportedBy,
    includesSecrets: opts.includeSecrets,
    collections: [{ ...collection, requests }],
  };
}

export function serializeCollectionFile(file: CollectionFile): string {
  return JSON.stringify(file, null, 2) + '\n';
}

/** Imported ids may be anything, so the schema used for import accepts any non-empty string. */
const looseId = z.string().min(1).max(500);
const looseKeyValue = z.object({
  id: looseId.optional(),
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().default(true),
});

function looseCollectionSchema() {
  // Reuse the real schema for structure, but relax ids (they're replaced) and fill defaults.
  const shape = collectionSchema.shape;
  const request = shape.requests.element;
  return z.object({
    schemaVersion: z.literal(1).optional(),
    id: looseId.optional(),
    name: z.string(),
    requests: z.array(
      request.extend({
        id: looseId.optional(),
        name: z.string().default(''),
        headers: z.array(looseKeyValue).default([]),
        disabledParams: z.array(looseKeyValue).default([]),
        body: z.unknown(),
      }),
    ),
  });
}

const fileSchema = z.object({
  format: z.literal(COLLECTION_FILE_FORMAT),
  formatVersion: z.number().int(),
  collections: z.array(z.unknown()).min(1),
});

function issuePath(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'invalid content';
  const where = issue.path.length ? ` at ${issue.path.join('.')}` : '';
  return `${issue.message}${where}`;
}

export interface ImportOptions {
  newId: () => string;
  /** Names already in use, so imports get "Name (2)" instead of a duplicate. */
  existingNames: string[];
}

export interface ImportResult {
  collections: Collection[];
  /** True when the file says it contains secrets. */
  includesSecrets: boolean;
}

/** Gives a collection a name that doesn't clash with `taken`, like "Users API (2)". */
export function uniqueName(name: string, taken: Set<string>): string {
  const base = name.trim() || 'Imported collection';
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Parses an exported file (or a bare collection) into new collections with fresh ids. */
export function parseCollectionFile(text: string, opts: ImportOptions): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw new CollectionImportError("The file isn't valid JSON.");
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new CollectionImportError("The file doesn't contain a SimpleRest collection.");
  }

  let rawCollections: unknown[];
  let includesSecrets = false;
  const obj = data as Record<string, unknown>;
  if ('format' in obj) {
    if (obj['format'] !== COLLECTION_FILE_FORMAT) {
      throw new CollectionImportError(`Unsupported file format "${String(obj['format'])}".`);
    }
    const parsed = fileSchema.safeParse(obj);
    if (!parsed.success)
      throw new CollectionImportError(`The file is malformed: ${issuePath(parsed.error)}.`);
    if (parsed.data.formatVersion > COLLECTION_FILE_VERSION) {
      throw new CollectionImportError(
        'This file was exported by a newer version of SimpleRest. Update the app to import it.',
      );
    }
    rawCollections = parsed.data.collections;
    includesSecrets = obj['includesSecrets'] === true;
  } else if ('requests' in obj && 'name' in obj) {
    rawCollections = [obj];
  } else if ('info' in obj && 'item' in obj) {
    throw new CollectionImportError(
      'This looks like a Postman collection. Only SimpleRest collection files can be imported.',
    );
  } else {
    throw new CollectionImportError("The file doesn't contain a SimpleRest collection.");
  }

  const schema = looseCollectionSchema();
  const taken = new Set(opts.existingNames.map((n) => n.trim().toLowerCase()));
  const collections = rawCollections.map((raw, i) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new CollectionImportError(
        `Collection ${i + 1} is malformed: ${issuePath(parsed.error)}.`,
      );
    }
    const c = parsed.data;
    const rekey = (rows: z.infer<typeof looseKeyValue>[]): KeyValue[] =>
      rows.map((r) => ({ id: opts.newId(), key: r.key, value: r.value, enabled: r.enabled }));
    const requests: SavedRequest[] = c.requests.map((r, j) => {
      // Field ids are replaced, so give them fresh ones before strict validation.
      let rawBody: unknown = r.body ?? { type: 'none' };
      if (
        rawBody &&
        typeof rawBody === 'object' &&
        Array.isArray((rawBody as { fields?: unknown }).fields)
      ) {
        const rb = rawBody as { fields: unknown[] };
        rawBody = {
          ...rb,
          fields: rb.fields.map((f) =>
            f && typeof f === 'object' ? { enabled: true, ...(f as object), id: opts.newId() } : f,
          ),
        };
      }
      const body = collectionSchema.shape.requests.element.shape.body.safeParse(rawBody);
      if (!body.success) {
        throw new CollectionImportError(
          `Request ${j + 1} in "${c.name}" has an invalid body: ${issuePath(body.error)}.`,
        );
      }
      const b = body.data as RequestBody;
      return {
        id: opts.newId(),
        name: r.name,
        method: r.method,
        url: r.url,
        disabledParams: rekey(r.disabledParams),
        headers: rekey(r.headers),
        body: clearFilePaths(b),
        auth: r.auth,
        options: r.options,
      };
    });
    const name = uniqueName(c.name, taken);
    taken.add(name.toLowerCase());
    return { schemaVersion: 1 as const, id: opts.newId(), name, requests };
  });
  return { collections, includesSecrets };
}
