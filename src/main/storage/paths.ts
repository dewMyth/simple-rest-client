import { join } from 'node:path';

/** File layout under the data folder. IDs are validated before they become file names. */
export class DataPaths {
  constructor(readonly root: string) {}
  get collectionsDir(): string {
    return join(this.root, 'collections');
  }
  get environmentsDir(): string {
    return join(this.root, 'environments');
  }
  collection(id: string): string {
    return join(this.collectionsDir, `${safeId(id)}.json`);
  }
  environment(id: string): string {
    return join(this.environmentsDir, `${safeId(id)}.json`);
  }
  get history(): string {
    return join(this.root, 'history.json');
  }
  get settings(): string {
    return join(this.root, 'settings.json');
  }
  get session(): string {
    return join(this.root, 'session.json');
  }
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/** File names come only from IDs, never user input. Rejects anything that could escape the folder. */
export function safeId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid id: ${JSON.stringify(id)}`);
  return id;
}

export function isSafeId(id: string): boolean {
  return ID_PATTERN.test(id);
}
