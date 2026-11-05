import { describe, expect, it } from 'vitest';
import {
  buildCollectionFile,
  parseCollectionFile,
  serializeCollectionFile,
  uniqueName,
} from '../../src/shared/collectionFile';
import { collectionSchema } from '../../src/shared/schemas';
import { DEFAULT_OPTIONS, type Collection } from '../../src/shared/types';

let n = 0;
const newId = () => `new${n++}`;
const kv = (key: string, value: string, enabled = true) => ({
  id: `kv-${key}`,
  key,
  value,
  enabled,
});

const collection: Collection = {
  schemaVersion: 1,
  id: 'orig-col',
  name: 'Users API',
  requests: [
    {
      id: 'orig-r1',
      name: 'Login',
      method: 'POST',
      url: '{{base}}/login?x=1',
      disabledParams: [kv('debug', 'true', false)],
      headers: [
        kv('Authorization', 'Bearer HEADERSECRET'),
        kv('X-Api-Key', 'KEYSECRET'),
        kv('Accept', 'application/json'),
      ],
      body: { type: 'json', content: '{"user":"{{user}}"}' },
      auth: { type: 'basic', username: 'USERSECRET', password: 'PASSSECRET' },
      options: { ...DEFAULT_OPTIONS, timeoutMs: 5000 },
    },
    {
      id: 'orig-r2',
      name: 'Upload',
      method: 'POST',
      url: 'https://x/upload',
      disabledParams: [],
      headers: [],
      body: {
        type: 'multipart',
        fields: [
          { id: 'f1', kind: 'text', key: 'title', value: 'Hi', enabled: true },
          {
            id: 'f2',
            kind: 'file',
            key: 'doc',
            filePath: '/Users/me/private/report.pdf',
            enabled: true,
          },
        ],
      },
      auth: { type: 'bearer', token: 'BEARERSECRET' },
      options: DEFAULT_OPTIONS,
    },
  ],
};

const exportText = (includeSecrets: boolean) =>
  serializeCollectionFile(
    buildCollectionFile(collection, { includeSecrets, exportedBy: 'SimpleRest/test' }),
  );

describe('export', () => {
  it('strips secrets by default but keeps header names', () => {
    const text = exportText(false);
    expect(text).not.toMatch(/SECRET/);
    expect(text).toContain('"Authorization"');
    expect(text).toContain('"includesSecrets": false');
  });

  it('includes secrets when asked', () => {
    const text = exportText(true);
    for (const s of ['HEADERSECRET', 'KEYSECRET', 'USERSECRET', 'PASSSECRET', 'BEARERSECRET'])
      expect(text).toContain(s);
  });

  it('never exports multipart file paths', () => {
    expect(exportText(true)).not.toContain('report.pdf');
  });

  it('does not change the original collection', () => {
    exportText(false);
    expect(collection.requests[1]!.auth).toEqual({ type: 'bearer', token: 'BEARERSECRET' });
  });
});

describe('import', () => {
  it('round-trips an export with fresh ids', () => {
    const { collections, includesSecrets } = parseCollectionFile(exportText(true), {
      newId,
      existingNames: [],
    });
    expect(includesSecrets).toBe(true);
    expect(collections).toHaveLength(1);
    const c = collections[0]!;
    expect(collectionSchema.safeParse(c).success).toBe(true);
    expect(c.id).not.toBe('orig-col');
    expect(c.requests.map((r) => r.id)).not.toContain('orig-r1');
    const strip = (x: unknown) =>
      JSON.parse(JSON.stringify(x, (k, v: unknown) => (k === 'id' ? undefined : v)));
    const expected = structuredClone(collection);
    (expected.requests[1]!.body as { fields: { filePath?: string }[] }).fields[1]!.filePath = '';
    expect(strip(c)).toEqual(strip(expected));
  });

  it('renames on name clashes', () => {
    const { collections } = parseCollectionFile(exportText(false), {
      newId,
      existingNames: ['users api', 'Users API (2)'],
    });
    expect(collections[0]!.name).toBe('Users API (3)');
    expect(uniqueName('  ', new Set())).toBe('Imported collection');
  });

  it('accepts a bare collection copied from the data folder', () => {
    const { collections } = parseCollectionFile(JSON.stringify(collection), {
      newId,
      existingNames: [],
    });
    expect(collections[0]!.requests).toHaveLength(2);
    expect(JSON.stringify(collections)).not.toContain('report.pdf');
  });

  it('accepts files with several collections and unusual ids', () => {
    const file = JSON.parse(exportText(false));
    const second = structuredClone(file.collections[0]);
    second.id = 'has spaces / and slashes';
    second.name = 'Second';
    second.requests[0].headers[0].id = '../../etc';
    second.requests[1].body.fields[0].id = 'weird id';
    file.collections.push(second);
    const { collections } = parseCollectionFile(JSON.stringify(file), { newId, existingNames: [] });
    expect(collections.map((c) => c.name)).toEqual(['Users API', 'Second']);
    for (const c of collections) expect(collectionSchema.safeParse(c).success).toBe(true);
  });

  it.each([
    ['not json', '{', 'valid JSON'],
    ['array', '[]', "doesn't contain"],
    ['other format', '{"format":"other","collections":[]}', 'Unsupported file format'],
    [
      'newer version',
      '{"format":"simplerest-collection","formatVersion":99,"collections":[{}]}',
      'newer version',
    ],
    ['postman', '{"info":{},"item":[]}', 'Postman'],
    [
      'bad method',
      JSON.stringify({ name: 'x', requests: [{ ...collection.requests[0], method: 'FETCH' }] }),
      'Collection 1 is malformed',
    ],
    [
      'bad body',
      JSON.stringify({
        name: 'x',
        requests: [{ ...collection.requests[0], body: { type: 'xml' } }],
      }),
      'invalid body',
    ],
  ])('rejects %s', (_name, text, message) => {
    expect(() => parseCollectionFile(text, { newId, existingNames: [] })).toThrow(message);
  });
});
