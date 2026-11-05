import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { DataStore } from '../../src/main/storage/store';
import { WriteQueue, writeFileAtomic } from '../../src/main/storage/atomicWrite';
import { readJsonFile } from '../../src/main/storage/jsonFile';
import { safeId } from '../../src/main/storage/paths';
import { stripSecrets } from '../../src/main/storage/history';
import { DEFAULT_OPTIONS, type Collection, type HttpRequestSpec } from '../../src/shared/types';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'simplerest-store-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const request = (overrides: Partial<HttpRequestSpec> = {}) => ({
  id: 'r1',
  name: 'List users',
  method: 'GET' as const,
  url: 'https://api.test/users',
  disabledParams: [],
  headers: [],
  body: { type: 'none' as const },
  auth: { type: 'none' as const },
  options: { ...DEFAULT_OPTIONS },
  ...overrides,
});

const collection = (id = 'c1', name = 'Users API'): Collection => ({
  schemaVersion: 1,
  id,
  name,
  requests: [request()],
});

describe('writeFileAtomic', () => {
  it('writes and replaces without leaving temp files', async () => {
    const file = join(dir, 'a', 'b.json');
    await writeFileAtomic(file, '1');
    await writeFileAtomic(file, '2');
    expect(readFileSync(file, 'utf8')).toBe('2');
    expect(readdirSync(join(dir, 'a'))).toEqual(['b.json']);
  });
});

describe('WriteQueue', () => {
  it('applies writes to the same file in order', async () => {
    const q = new WriteQueue();
    const file = join(dir, 'q.json');
    await Promise.all(Array.from({ length: 30 }, (_, i) => q.write(file, String(i))));
    expect(readFileSync(file, 'utf8')).toBe('29');
  });
});

describe('safeId', () => {
  it('rejects path traversal and odd names', () => {
    for (const bad of ['../x', 'a/b', 'a\\b', '', 'con:', 'x'.repeat(101), 'a b']) {
      expect(() => safeId(bad)).toThrow();
    }
    expect(safeId('abc-123_X')).toBe('abc-123_X');
  });
});

describe('readJsonFile', () => {
  const schema = z.object({ schemaVersion: z.literal(2), name: z.string() });

  it('runs migrations', async () => {
    const file = join(dir, 'm.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, title: 'x' }));
    const res = await readJsonFile(file, schema, 2, { 1: (d) => ({ name: d['title'] }) });
    expect(res).toEqual({ status: 'ok', value: { schemaVersion: 2, name: 'x' } });
  });

  it('sets aside files from a newer version', async () => {
    const file = join(dir, 'n.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 9, name: 'x' }));
    const res = await readJsonFile(file, schema, 2);
    expect(res.status).toBe('corrupt');
    expect(existsSync(file)).toBe(false);
  });

  it('accepts a UTF-8 BOM', async () => {
    const file = join(dir, 'bom.json');
    writeFileSync(file, '﻿' + JSON.stringify({ schemaVersion: 2, name: 'x' }));
    expect((await readJsonFile(file, schema, 2)).status).toBe('ok');
  });
});

describe('DataStore', () => {
  it('starts empty when the data folder does not exist', async () => {
    const store = new DataStore(join(dir, 'missing'));
    const data = await store.loadAll();
    expect(data.collections).toEqual([]);
    expect(data.session).toBeNull();
    expect(data.warnings).toEqual([]);
    expect(data.settings.defaultOptions).toEqual(DEFAULT_OPTIONS);
  });

  it('round-trips collections in the saved order', async () => {
    const store = new DataStore(dir);
    await store.saveCollection(collection('c1', 'One'));
    await store.saveCollection(collection('c2', 'Two'));
    await store.updateSettings({ collectionOrder: ['c2', 'c1'] });
    const data = await new DataStore(dir).loadAll();
    expect(data.collections.map((c) => c.name)).toEqual(['Two', 'One']);
    expect(data.collections[0]!.requests[0]!.name).toBe('List users');
  });

  it('names files by id', async () => {
    const store = new DataStore(dir);
    await store.saveCollection(collection('abc', 'Weird / name: <>?'));
    expect(readdirSync(join(dir, 'collections'))).toEqual(['abc.json']);
  });

  it('preserves a corrupt collection and keeps loading the rest', async () => {
    const store = new DataStore(dir);
    await store.saveCollection(collection('good', 'Good'));
    mkdirSync(join(dir, 'collections'), { recursive: true });
    writeFileSync(join(dir, 'collections', 'bad.json'), '{ not json');
    const data = await new DataStore(dir).loadAll();
    expect(data.collections.map((c) => c.id)).toEqual(['good']);
    expect(data.warnings).toHaveLength(1);
    expect(data.warnings[0]).toContain('bad.json');
    const files = readdirSync(join(dir, 'collections'));
    const kept = files.find((f) => f.startsWith('bad.corrupt-'));
    expect(kept).toBeDefined();
    expect(readFileSync(join(dir, 'collections', kept!), 'utf8')).toBe('{ not json');
  });

  it('preserves corrupt settings and session files and falls back to defaults', async () => {
    writeFileSync(join(dir, 'settings.json'), '[]');
    writeFileSync(join(dir, 'session.json'), '{"schemaVersion":1,"tabs":"nope"}');
    const data = await new DataStore(dir).loadAll();
    expect(data.settings.theme).toBe('system');
    expect(data.session).toBeNull();
    expect(data.warnings).toHaveLength(2);
    expect(readdirSync(dir).filter((f) => f.includes('.corrupt-'))).toHaveLength(2);
  });

  it('round-trips the session', async () => {
    const store = new DataStore(dir);
    const req = request();
    await store.saveSession({
      schemaVersion: 1,
      activeTabId: 't1',
      tabs: [
        {
          id: 't1',
          request: { ...req, url: 'https://draft' },
          savedRef: { collectionId: 'c1', requestId: 'r1' },
          snapshot: JSON.stringify(req),
          requestSection: 'body',
          responseSection: 'body',
          responseView: 'raw',
        },
      ],
    });
    const data = await new DataStore(dir).loadAll();
    expect(data.session?.tabs[0]?.request.url).toBe('https://draft');
    expect(data.session?.tabs[0]?.requestSection).toBe('body');
  });

  it('deletes a collection file', async () => {
    const store = new DataStore(dir);
    await store.saveCollection(collection('gone'));
    await store.deleteCollection('gone');
    expect(readdirSync(join(dir, 'collections'))).toEqual([]);
  });

  it('flushes debounced window bounds', async () => {
    const store = new DataStore(dir);
    store.setWindowBounds({ x: 1, y: 2, width: 800, height: 600, maximized: false });
    await store.flush();
    const data = await new DataStore(dir).loadAll();
    expect(data.settings.windowBounds).toEqual({
      x: 1,
      y: 2,
      width: 800,
      height: 600,
      maximized: false,
    });
  });
});

describe('history secrets', () => {
  const secretRequest: HttpRequestSpec = {
    method: 'POST',
    url: 'https://api.test/login',
    headers: [
      { id: 'h1', key: 'Authorization', value: 'Bearer SECRET1', enabled: true },
      { id: 'h2', key: 'cookie', value: 'session=SECRET2', enabled: true },
      { id: 'h3', key: 'Proxy-Authorization', value: 'SECRET3', enabled: false },
      { id: 'h4', key: ' X-Api-Key ', value: 'SECRET4', enabled: true },
      { id: 'h5', key: 'X-Trace', value: 'visible', enabled: true },
    ],
    body: { type: 'none' },
    auth: { type: 'basic', username: 'SECRET5', password: 'SECRET6' },
    options: DEFAULT_OPTIONS,
  };

  it('strips auth and secret header values', () => {
    const s = stripSecrets(secretRequest);
    expect(s.auth).toEqual({ type: 'basic', username: '', password: '' });
    expect(s.headers.map((h) => h.value)).toEqual(['', '', '', '', 'visible']);
    expect(stripSecrets({ ...secretRequest, auth: { type: 'bearer', token: 'T' } }).auth).toEqual({
      type: 'bearer',
      token: '',
    });
  });

  it('never writes auth values to history.json', async () => {
    const store = new DataStore(dir);
    await store.addHistory({
      id: 'h1',
      sentAt: 1,
      request: secretRequest,
      status: 200,
      durationMs: 5,
      error: null,
    });
    await store.addHistory({
      id: 'h2',
      sentAt: 2,
      request: { ...secretRequest, auth: { type: 'bearer', token: 'SECRET7' } },
      status: null,
      durationMs: null,
      error: 'Timed out',
    });
    const text = readFileSync(join(dir, 'history.json'), 'utf8');
    expect(text).not.toMatch(/SECRET\d/);
    expect(text).toContain('visible');
  });

  it('keeps only the last 200 entries, newest first', async () => {
    const store = new DataStore(dir);
    for (let i = 0; i < 205; i++) {
      await store.addHistory({
        id: `h${i}`,
        sentAt: i,
        request: secretRequest,
        status: 200,
        durationMs: 1,
        error: null,
      });
    }
    const data = await new DataStore(dir).loadAll();
    expect(data.history).toHaveLength(200);
    expect(data.history[0]!.id).toBe('h204');
  });
});

describe('initial load', () => {
  it('keeps startup warnings for the renderer', async () => {
    writeFileSync(join(dir, 'settings.json'), 'garbage');
    const store = new DataStore(dir);
    await store.loadInitial();
    expect((await store.loadForRenderer()).warnings).toHaveLength(1);
    expect((await store.loadForRenderer()).warnings).toHaveLength(0);
  });
});
