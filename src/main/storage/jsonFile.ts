import { readFile, rename } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import type { z } from 'zod';

export type ReadResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'missing' }
  | { status: 'corrupt'; movedTo: string | null; reason: string };

/** Upgrades older files. Keyed by the version being upgraded from. */
export type Migrations = Record<number, (data: Record<string, unknown>) => Record<string, unknown>>;

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Moves a broken file to `<name>.corrupt-<timestamp>.json`. Never deletes it. */
export async function setAside(path: string): Promise<string | null> {
  const ext = extname(path);
  const target = join(
    dirname(path),
    `${basename(path, ext)}.corrupt-${timestamp()}${ext || '.json'}`,
  );
  try {
    await rename(path, target);
    return target;
  } catch {
    return null;
  }
}

/**
 * Reads and validates a JSON file, running migrations first. A file that can't be parsed,
 * has an unknown schema version, or fails validation is set aside rather than overwritten.
 */
export async function readJsonFile<S extends z.ZodType>(
  path: string,
  schema: S,
  currentVersion: number,
  migrations: Migrations = {},
): Promise<ReadResult<z.infer<S>>> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' };
    return { status: 'corrupt', movedTo: null, reason: (err as Error).message };
  }

  const fail = async (reason: string): Promise<ReadResult<z.infer<S>>> => ({
    status: 'corrupt',
    movedTo: await setAside(path),
    reason,
  });

  let data: unknown;
  try {
    data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (err) {
    return fail(`invalid JSON (${(err as Error).message})`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('not a JSON object');

  let obj = data as Record<string, unknown>;
  let version = typeof obj['schemaVersion'] === 'number' ? obj['schemaVersion'] : NaN;
  if (!Number.isInteger(version) || version < 1) return fail('missing schemaVersion');
  if (version > currentVersion) return fail(`made by a newer version (schemaVersion ${version})`);
  while (version < currentVersion) {
    const migrate = migrations[version];
    if (!migrate) return fail(`no migration from schemaVersion ${version}`);
    obj = migrate(obj);
    version++;
    obj['schemaVersion'] = version;
  }

  const parsed = schema.safeParse(obj);
  if (!parsed.success)
    return fail(`unexpected content (${parsed.error.issues[0]?.message ?? 'invalid'})`);
  return { status: 'ok', value: parsed.data };
}
