import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Writes `data` to `path` atomically: a temp file in the same folder is renamed over the target.
 * On Windows, antivirus and indexers can hold the target briefly, so the rename is retried.
 */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
  await writeFile(tmp, data, 'utf8');
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, path);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (attempt < 8 && RETRY_CODES.has(code)) {
        await sleep(25 * 2 ** Math.min(attempt, 4));
        continue;
      }
      await rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  }
}

/** Serializes writes per file so they can never overlap or land out of order. */
export class WriteQueue {
  private readonly tails = new Map<string, Promise<void>>();

  write(path: string, data: string): Promise<void> {
    const prev = this.tails.get(path) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => writeFileAtomic(path, data));
    this.tails.set(path, next);
    void next
      .finally(() => {
        if (this.tails.get(path) === next) this.tails.delete(path);
      })
      .catch(() => undefined);
    return next;
  }

  /** Runs `fn` after any pending write to `path` (used for deletes). */
  after<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(path) ?? Promise.resolve();
    return prev.catch(() => undefined).then(fn);
  }

  async flush(): Promise<void> {
    await Promise.allSettled([...this.tails.values()]);
  }
}
