import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  CurlParseError,
  looksLikeCurl,
  parseCurl,
  shellQuote,
  tokenize,
  toCurl,
} from '../../src/shared/curl';
import { DEFAULT_OPTIONS, type HttpRequestSpec } from '../../src/shared/types';

let n = 0;
const ids = () => `id${n++}`;
const strip = (r: HttpRequestSpec) =>
  JSON.parse(JSON.stringify(r, (k, v: unknown) => (k === 'id' ? undefined : v))) as unknown;

const base = (o: Partial<HttpRequestSpec> = {}): HttpRequestSpec => ({
  method: 'GET',
  url: 'https://api.test/users?page=2&q=a%20b',
  headers: [],
  body: { type: 'none' },
  auth: { type: 'none' },
  options: { ...DEFAULT_OPTIONS, followRedirects: false },
  ...o,
});

const kv = (key: string, value: string) => ({ id: ids(), key, value, enabled: true });
const tricky = `it's "quoted" $HOME \`cmd\` \\ back\nnew line & | ; > *`;

describe('tokenize', () => {
  it('handles quotes, escapes and continuations', () => {
    expect(tokenize(`curl 'a b' "c \\"d\\" \\$e" f\\ g \\\n  -H $'x\\ny'`)).toEqual([
      'curl',
      'a b',
      'c "d" $e',
      'f g',
      '-H',
      'x\ny',
    ]);
  });
  it('handles Windows ^ continuations', () => {
    expect(tokenize('curl ^\n  "http://x"')).toEqual(['curl', 'http://x']);
  });
  it('rejects unclosed quotes', () => {
    expect(() => tokenize("curl 'oops")).toThrow(CurlParseError);
  });
});

describe('parseCurl', () => {
  it('detects curl commands', () => {
    expect(looksLikeCurl('  curl https://x')).toBe(true);
    expect(looksLikeCurl('https://curl.se')).toBe(false);
  });

  it('parses a typical browser "Copy as cURL"', () => {
    const r = parseCurl(
      `curl 'https://api.test/items' -H 'accept: application/json' -H 'content-type: application/json' --data-raw '{"a":1}' --compressed`,
      ids,
    );
    expect(r.method).toBe('POST');
    expect(r.body).toEqual({ type: 'json', content: '{"a":1}' });
    expect(r.headers.map((h) => h.key)).toEqual(['accept']);
  });

  it('supports -X, -H, -d, -u, -L, -k and combined short flags', () => {
    const r = parseCurl(
      `curl -sSLk -XPUT -u user:p@ss:word -H "X-A: 1" -d 'x=1' -d 'y=2' http://h/p`,
      ids,
    );
    expect(r.method).toBe('PUT');
    expect(r.url).toBe('http://h/p');
    expect(r.auth).toEqual({ type: 'basic', username: 'user', password: 'p@ss:word' });
    expect(r.options).toMatchObject({ followRedirects: true, verifyTls: false });
    expect(r.body).toMatchObject({
      type: 'form',
      fields: [
        { key: 'x', value: '1' },
        { key: 'y', value: '2' },
      ],
    });
  });

  it('supports --data-urlencode', () => {
    const r = parseCurl(`curl https://x --data-urlencode 'q=a b&c' --data-urlencode 'z='`, ids);
    expect(r.body).toMatchObject({
      type: 'form',
      fields: [
        { key: 'q', value: 'a b&c' },
        { key: 'z', value: '' },
      ],
    });
  });

  it('supports -F with text and file fields', () => {
    const r = parseCurl(`curl https://x -F name=Ada -F 'avatar=@/tmp/a.png'`, ids);
    expect(r.method).toBe('POST');
    expect(r.body).toMatchObject({
      type: 'multipart',
      fields: [
        { kind: 'text', key: 'name', value: 'Ada' },
        { kind: 'file', key: 'avatar', filePath: '' },
      ],
    });
  });

  it('keeps non-form data as text with its content type', () => {
    const r = parseCurl(`curl https://x -H 'Content-Type: application/xml' -d '<a>1</a>'`, ids);
    expect(r.body).toEqual({ type: 'text', content: '<a>1</a>' });
    expect(r.headers).toMatchObject([{ key: 'Content-Type', value: 'application/xml' }]);
  });

  it('turns a Bearer header into bearer auth', () => {
    expect(parseCurl(`curl https://x -H 'Authorization: Bearer abc.def'`, ids).auth).toEqual({
      type: 'bearer',
      token: 'abc.def',
    });
  });

  it('handles -I, -G and --url=', () => {
    expect(parseCurl('curl -I https://x', ids).method).toBe('HEAD');
    expect(parseCurl(`curl -G --url=https://x?a=1 -d b=2`, ids)).toMatchObject({
      method: 'GET',
      url: 'https://x?a=1&b=2',
    });
  });

  it('keeps {{variables}}', () => {
    expect(parseCurl(`curl '{{base}}/u' -H 'X: {{token}}'`, ids)).toMatchObject({
      url: '{{base}}/u',
      headers: [{ key: 'X', value: '{{token}}' }],
    });
  });

  it('errors without a URL', () => {
    expect(() => parseCurl('curl -X POST', ids)).toThrow('No URL');
  });
});

describe('toCurl', () => {
  it('quotes for the shell', () => {
    expect(shellQuote('simple-word')).toBe('simple-word');
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it.skipIf(process.platform === 'win32')(
    'produces arguments a real shell reads back exactly',
    () => {
      const words = ['https://x/?a=1&b=2', tricky, '', '-H', '$(rm -rf /)'];
      const script = `for a in ${words.map(shellQuote).join(' ')}; do printf '%s\\0' "$a"; done`;
      const out = execFileSync('/bin/sh', ['-c', script], { encoding: 'utf8' });
      expect(out.split('\0').slice(0, -1)).toEqual(words);
    },
  );

  it('omits -X when curl would infer the method', () => {
    expect(toCurl(base())).toBe(`curl 'https://api.test/users?page=2&q=a%20b'`);
    expect(toCurl(base({ method: 'POST', body: { type: 'json', content: '{}' } }))).not.toContain(
      '-X',
    );
    expect(toCurl(base({ method: 'DELETE' }))).toContain('-X DELETE');
    expect(toCurl(base({ method: 'HEAD' }))).toContain('-I');
  });
});

describe('round trip', () => {
  const cases: [string, HttpRequestSpec][] = [
    ['plain GET', base()],
    ['HEAD', base({ method: 'HEAD' })],
    ['GET with body', base({ body: { type: 'text', content: 'x' } })],
    [
      'JSON POST with quotes in values',
      base({
        method: 'POST',
        headers: [kv('X-Quote', tricky), kv('Accept', '*/*')],
        body: { type: 'json', content: `{"msg":${JSON.stringify(tricky)}}` },
        auth: { type: 'bearer', token: "tok'en" },
      }),
    ],
    ['text PATCH', base({ method: 'PATCH', body: { type: 'text', content: tricky } })],
    [
      'form PUT with basic auth',
      base({
        method: 'PUT',
        body: {
          type: 'form',
          fields: [kv('name', "O'Brien & co"), kv('empty', ''), kv('eq', 'a=b')],
        },
        auth: { type: 'basic', username: 'me', password: "p'w:x" },
      }),
    ],
    [
      'multipart text fields',
      base({
        method: 'POST',
        body: {
          type: 'multipart',
          fields: [
            { id: ids(), kind: 'text', key: 'a', value: '@not-a-file', enabled: true },
            { id: ids(), kind: 'text', key: 'b', value: tricky, enabled: true },
          ],
        },
      }),
    ],
    ['options', base({ options: { timeoutMs: 1500, followRedirects: true, verifyTls: false } })],
    ['no timeout', base({ options: { timeoutMs: 0, followRedirects: false, verifyTls: true } })],
    [
      'custom content type',
      base({
        method: 'POST',
        headers: [kv('Content-Type', 'application/xml')],
        body: { type: 'text', content: '<a/>' },
      }),
    ],
  ];

  it.each(cases)('%s', (_name, req) => {
    const back = parseCurl(toCurl(req), ids);
    expect(strip(back)).toEqual(strip(req));
  });
});
