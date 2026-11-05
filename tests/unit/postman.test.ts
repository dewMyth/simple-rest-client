import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  exportPostmanCollection,
  importPostmanCollection,
  importPostmanEnvironment,
  POSTMAN_SCHEMA_V21,
  toPostmanUrl,
} from '../../src/shared/postman';
import { parseImportFile } from '../../src/shared/importFile';
import { collectionSchema, environmentSchema } from '../../src/shared/schemas';
import { DEFAULT_OPTIONS, type Collection, type SavedRequest } from '../../src/shared/types';

let n = 0;
const newId = () => `id${n++}`;
const fixture = (name: string) =>
  readFileSync(join(__dirname, '../fixtures/postman', name), 'utf8');
const load = (name: string) => JSON.parse(fixture(name)) as unknown;

describe('Postman collection import', () => {
  const { collection, environment, notes } = importPostmanCollection(
    load('sample.postman_collection.json'),
    { newId },
  );
  const byName = (name: string): SavedRequest => {
    const r = collection.requests.find((x) => x.name === name);
    if (!r)
      throw new Error(`missing ${name}: ${collection.requests.map((x) => x.name).join(', ')}`);
    return r;
  };

  it('produces a valid collection with flattened, prefixed names in order', () => {
    expect(collectionSchema.safeParse(collection).success).toBe(true);
    expect(collection.name).toBe('Shop API');
    expect(collection.requests.map((r) => r.name)).toEqual([
      'Health',
      'Products / List products',
      'Products / Get product',
      'Products / Admin / Create product',
      'Products / Admin / Import XML',
      'Products / Admin / Public delete',
      'Account / Login',
      'Account / Avatar',
      'Account / Search (GraphQL)',
      'Account / Upload binary',
    ]);
  });

  it('handles string requests and inherits collection auth', () => {
    expect(byName('Health')).toMatchObject({
      method: 'GET',
      url: 'https://shop.test/health',
      auth: { type: 'bearer', token: '{{token}}' },
    });
  });

  it('keeps headers, disabled flags and disabled query params', () => {
    const r = byName('Products / List products');
    expect(r.url).toBe('{{base}}/products?page=1&q=shoes');
    expect(r.headers.map((h) => [h.key, h.value, h.enabled])).toEqual([
      ['Accept', 'application/json', true],
      ['X-Debug', '1', false],
    ]);
    expect(r.disabledParams).toMatchObject([{ key: 'sort', value: 'price', enabled: false }]);
  });

  it('converts path variables', () => {
    expect(byName('Products / Get product').url).toBe('{{base}}/products/{{productId}}');
  });

  it('uses folder auth over collection auth, and explicit noauth', () => {
    expect(byName('Products / Admin / Create product').auth).toEqual({
      type: 'basic',
      username: 'admin',
      password: 's3cret',
    });
    expect(byName('Products / Admin / Public delete').auth).toEqual({ type: 'none' });
  });

  it('maps JSON and XML raw bodies and request settings', () => {
    const create = byName('Products / Admin / Create product');
    expect(create.body).toEqual({ type: 'json', content: '{\n  "name": "Shoe"\n}' });
    expect(create.options).toEqual({
      ...DEFAULT_OPTIONS,
      followRedirects: false,
      verifyTls: false,
    });
    const xml = byName('Products / Admin / Import XML');
    expect(xml.body).toEqual({ type: 'text', content: '<products/>' });
    expect(xml.headers).toMatchObject([{ key: 'Content-Type', value: 'application/xml' }]);
  });

  it('maps urlencoded bodies and API key auth in headers and query', () => {
    const login = byName('Account / Login');
    expect(login.body).toMatchObject({
      type: 'form',
      fields: [
        { key: 'user', value: 'ada', enabled: true },
        { key: 'remember', value: '1', enabled: false },
      ],
    });
    expect(login.auth).toEqual({ type: 'none' });
    expect(login.headers).toMatchObject([{ key: 'X-Shop-Key', value: 'k-999' }]);
    expect(byName('Account / Avatar').url).toBe('{{base}}/avatar?api_key=q-1');
  });

  it('maps formdata without file paths', () => {
    expect(byName('Account / Avatar').body).toMatchObject({
      type: 'multipart',
      fields: [
        { kind: 'text', key: 'caption', value: 'me' },
        { kind: 'file', key: 'file', filePath: '' },
      ],
    });
    expect(JSON.stringify(collection)).not.toContain('me.png');
  });

  it('converts GraphQL to JSON and builds URLs from parts', () => {
    const g = byName('Account / Search (GraphQL)');
    expect(g.url).toBe('https://shop.test:8443/graphql');
    expect(g.body.type).toBe('json');
    expect(JSON.parse((g.body as { content: string }).content)).toEqual({
      query: '{ me { id } }',
      variables: { a: 1 },
    });
    expect(g.auth).toEqual({ type: 'none' });
  });

  it('falls back for unsupported methods and file bodies', () => {
    expect(byName('Account / Upload binary')).toMatchObject({
      method: 'GET',
      body: { type: 'none' },
    });
  });

  it('creates an environment from collection and path variables', () => {
    expect(environment).not.toBeNull();
    expect(environmentSchema.safeParse(environment).success).toBe(true);
    expect(environment!.name).toBe('Shop API variables');
    expect(environment!.variables.map((v) => [v.key, v.value, v.enabled])).toEqual([
      ['base', 'https://shop.test/api', true],
      ['token', 'abc123', true],
      ['old', 'x', false],
      ['productId', '42', true],
    ]);
  });

  it('explains what could not be carried over', () => {
    const text = notes.join('\n');
    expect(text).toContain('scripts were skipped (1 item)');
    expect(text).toContain('oauth2');
    expect(text).toContain('File fields');
    expect(text).toContain('GraphQL');
    expect(text).toContain('PURGE');
    expect(text).toContain('Path variables');
  });

  it('reads v2.0 object-shaped auth', () => {
    const legacy = importPostmanCollection(load('v20.postman_collection.json'), { newId });
    expect(legacy.collection.requests[0]!.auth).toEqual({
      type: 'basic',
      username: 'u',
      password: 'p',
    });
    expect(legacy.environment).toBeNull();
  });
});

describe('Postman environment import', () => {
  it('maps values and enabled flags', () => {
    const env = importPostmanEnvironment(load('dev.postman_environment.json'), { newId });
    expect(environmentSchema.safeParse(env).success).toBe(true);
    expect(env.name).toBe('Shop Dev');
    expect(env.variables.map((v) => [v.key, v.value, v.enabled])).toEqual([
      ['base', 'http://localhost:3000/api', true],
      ['token', 'dev-token', true],
      ['unused', 'x', false],
    ]);
  });
});

describe('parseImportFile', () => {
  it('detects each file type and keeps names unique', () => {
    const opts = { newId, collectionNames: ['Shop API'], environmentNames: ['Shop Dev'] };
    const a = parseImportFile(fixture('sample.postman_collection.json'), opts);
    expect(a.kind).toBe('postman-collection');
    expect(a.collections[0]!.name).toBe('Shop API (2)');
    expect(a.environments[0]!.name).toBe('Shop API variables');
    expect(a.notes.length).toBeGreaterThan(0);
    const b = parseImportFile(fixture('dev.postman_environment.json'), opts);
    expect(b).toMatchObject({
      kind: 'postman-environment',
      collections: [],
      environments: [{ name: 'Shop Dev (2)' }],
    });
    const c = parseImportFile(fixture('sample.postman_collection.json'), opts);
    expect(c.collections[0]!.name).toBe('Shop API (3)');
    expect(c.environments[0]!.name).toBe('Shop API variables (2)');
  });

  it('rejects unrelated JSON', () => {
    expect(() =>
      parseImportFile('{"a":1}', { newId, collectionNames: [], environmentNames: [] }),
    ).toThrow("isn't a SimpleRest collection, Postman collection or Postman environment");
  });
});

describe('Postman export', () => {
  const kv = (key: string, value: string, enabled = true) => ({ id: newId(), key, value, enabled });
  const collection: Collection = {
    schemaVersion: 1,
    id: 'c1',
    name: 'Shop API',
    requests: [
      {
        id: 'r1',
        name: 'Products / List',
        method: 'GET',
        url: '{{base}}/products?page=1&q',
        disabledParams: [kv('sort', 'price', false)],
        headers: [
          kv('Accept', 'application/json'),
          kv('X-Off', '1', false),
          kv('Authorization', 'Bearer HDRSECRET'),
        ],
        body: { type: 'none' },
        auth: { type: 'bearer', token: 'TOKSECRET' },
        options: { ...DEFAULT_OPTIONS, followRedirects: false, verifyTls: false },
      },
      {
        id: 'r2',
        name: 'Create',
        method: 'POST',
        url: 'http://localhost:3000/products',
        disabledParams: [],
        headers: [],
        body: { type: 'json', content: '{"a":1}' },
        auth: { type: 'basic', username: 'admin', password: 'PWSECRET' },
        options: DEFAULT_OPTIONS,
      },
      {
        id: 'r3',
        name: 'Form',
        method: 'PUT',
        url: 'https://x.test/f',
        disabledParams: [],
        headers: [],
        body: { type: 'form', fields: [kv('a', '1'), kv('b', '2', false)] },
        auth: { type: 'none' },
        options: DEFAULT_OPTIONS,
      },
      {
        id: 'r4',
        name: 'Upload',
        method: 'POST',
        url: 'https://x.test/u',
        disabledParams: [],
        headers: [],
        body: {
          type: 'multipart',
          fields: [
            { id: 'm1', kind: 'text', key: 't', value: 'v', enabled: true },
            {
              id: 'm2',
              kind: 'file',
              key: 'f',
              filePath: '/Users/me/secret-folder/a.pdf',
              enabled: true,
            },
          ],
        },
        auth: { type: 'none' },
        options: DEFAULT_OPTIONS,
      },
    ],
  };

  it('writes a v2.1 collection', () => {
    const out = exportPostmanCollection(collection, { includeSecrets: true, postmanId: 'pid' });
    expect(out['info']).toEqual({
      _postman_id: 'pid',
      name: 'Shop API',
      schema: POSTMAN_SCHEMA_V21,
    });
    const item = (out['item'] as Record<string, unknown>[])[0]!;
    expect(item).toMatchObject({
      name: 'Products / List',
      protocolProfileBehavior: { followRedirects: false, strictSSL: false },
      request: {
        method: 'GET',
        header: [
          { key: 'Accept', value: 'application/json' },
          { key: 'X-Off', value: '1', disabled: true },
          { key: 'Authorization', value: 'Bearer HDRSECRET' },
        ],
        url: {
          raw: '{{base}}/products?page=1&q',
          host: ['{{base}}'],
          path: ['products'],
          query: [
            { key: 'page', value: '1' },
            { key: 'q', value: null },
            { key: 'sort', value: 'price', disabled: true },
          ],
        },
        auth: { type: 'bearer', bearer: [{ key: 'token', value: 'TOKSECRET' }] },
      },
    });
  });

  it('strips secrets and file paths', () => {
    const text = JSON.stringify(
      exportPostmanCollection(collection, { includeSecrets: false, postmanId: 'pid' }),
    );
    expect(text).not.toMatch(/SECRET|secret-folder/);
  });

  it('splits URLs with ports and plain hosts', () => {
    expect(toPostmanUrl('http://localhost:3000/a/b?x=1', [])).toEqual({
      raw: 'http://localhost:3000/a/b?x=1',
      protocol: 'http',
      host: ['localhost'],
      port: '3000',
      path: ['a', 'b'],
      query: [{ key: 'x', value: '1' }],
    });
  });

  it('round-trips through import (timeouts excepted)', () => {
    const exported = exportPostmanCollection(collection, {
      includeSecrets: true,
      postmanId: 'pid',
    });
    const back = importPostmanCollection(JSON.parse(JSON.stringify(exported)), {
      newId,
    }).collection;
    const strip = (x: unknown) =>
      JSON.parse(JSON.stringify(x, (k, v: unknown) => (k === 'id' ? undefined : v)));
    const expected = structuredClone(collection);
    (expected.requests[3]!.body as { fields: { filePath?: string }[] }).fields[1]!.filePath = '';
    expect(strip(back.requests)).toEqual(strip(expected.requests));
  });
});
