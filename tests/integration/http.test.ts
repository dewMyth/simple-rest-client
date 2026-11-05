import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpClient } from '../../src/main/http/client';
import { approveFilePath } from '../../src/main/http/body';
import { DEFAULT_OPTIONS, type HttpRequestSpec, type SendResult } from '../../src/shared/types';
import { startTestServer, fixtures, type EchoBody, type TestServer } from '../fixtures/testServer';

let server: TestServer;
let client: HttpClient;
let n = 0;

beforeAll(async () => {
  server = await startTestServer();
  client = new HttpClient({ userAgent: 'SimpleRest/test' });
});
afterAll(async () => {
  await client.close();
  await server.close();
});

function spec(overrides: Partial<HttpRequestSpec> = {}): HttpRequestSpec {
  return {
    method: 'GET',
    url: `${server.url}/echo`,
    headers: [],
    body: { type: 'none' },
    auth: { type: 'none' },
    options: { ...DEFAULT_OPTIONS },
    ...overrides,
  };
}

function send(
  s: Partial<HttpRequestSpec>,
  variables: Record<string, string> = {},
  sendId = `s${++n}`,
) {
  return client.send({ sendId, tabId: 'tab1', request: spec(s), variables });
}

function ok(r: SendResult) {
  if (!r.ok) throw new Error(`Expected success, got ${r.error.kind}: ${r.error.message}`);
  return r.response;
}

function err(r: SendResult) {
  if (r.ok) throw new Error(`Expected failure, got status ${r.response.status}`);
  return r.error;
}

const echo = (r: SendResult) => JSON.parse(ok(r).bodyText) as EchoBody;
const kv = (key: string, value: string, enabled = true) => ({
  id: key + value,
  key,
  value,
  enabled,
});

describe('echo and request building', () => {
  it('sends default headers', async () => {
    const e = echo(await send({}));
    expect(e.method).toBe('GET');
    expect(e.headers['user-agent']).toBe('SimpleRest/test');
    expect(e.headers['accept-encoding']).toBe('gzip, deflate, br');
    expect(e.headers['accept']).toBe('*/*');
  });

  it('sends enabled headers only and lets users override defaults', async () => {
    const e = echo(
      await send({
        headers: [kv('X-On', '1'), kv('X-Off', '2', false), kv('User-Agent', 'mine')],
      }),
    );
    expect(e.headers['x-on']).toBe('1');
    expect(e.headers['x-off']).toBeUndefined();
    expect(e.headers['user-agent']).toBe('mine');
  });

  it('adds http:// when the scheme is missing', async () => {
    const r = ok(await send({ url: `${server.url.replace('http://', '')}/echo` }));
    expect(r.status).toBe(200);
  });

  it('keeps query strings exactly as typed', async () => {
    const e = echo(await send({ url: `${server.url}/echo?a=1&b=%20x&c` }));
    expect(e.url).toBe('/echo?a=1&b=%20x&c');
  });

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const)(
    'sends %s',
    async (method) => {
      expect(echo(await send({ method })).method).toBe(method);
    },
  );

  it('handles HEAD with an empty body', async () => {
    const r = ok(await send({ method: 'HEAD' }));
    expect(r.status).toBe(200);
    expect(r.bodyText).toBe('');
    expect(r.decodedSizeBytes).toBe(0);
  });
});

describe('bodies', () => {
  it('sends JSON with a default content type', async () => {
    const e = echo(await send({ method: 'POST', body: { type: 'json', content: '{"a":1}' } }));
    expect(e.body).toBe('{"a":1}');
    expect(e.headers['content-type']).toBe('application/json');
  });

  it('keeps a user-set content type', async () => {
    const e = echo(
      await send({
        method: 'POST',
        headers: [kv('content-type', 'application/vnd.api+json')],
        body: { type: 'json', content: '{}' },
      }),
    );
    expect(e.headers['content-type']).toBe('application/vnd.api+json');
  });

  it('sends plain text', async () => {
    const e = echo(await send({ method: 'POST', body: { type: 'text', content: 'héllo' } }));
    expect(e.body).toBe('héllo');
    expect(e.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('sends url-encoded forms', async () => {
    const e = echo(
      await send({
        method: 'POST',
        body: { type: 'form', fields: [kv('a', '1 2'), kv('b', '&='), kv('c', 'x', false)] },
      }),
    );
    expect(e.body).toBe('a=1+2&b=%26%3D');
    expect(e.headers['content-type']).toBe('application/x-www-form-urlencoded');
  });

  it('sends multipart text and file fields', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'simplerest-'));
    const file = join(dir, 'note.txt');
    writeFileSync(file, 'file contents');
    approveFilePath(file);
    const e = echo(
      await send({
        method: 'POST',
        body: {
          type: 'multipart',
          fields: [
            { id: '1', kind: 'text', key: 'name', value: 'Ada', enabled: true },
            { id: '2', kind: 'file', key: 'upload', filePath: file, enabled: true },
          ],
        },
      }),
    );
    expect(e.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(e.body).toContain('name="name"');
    expect(e.body).toContain('Ada');
    expect(e.body).toContain('filename="note.txt"');
    expect(e.body).toContain('file contents');
  });

  it('refuses file paths that did not come from the file picker', async () => {
    const e = err(
      await send({
        method: 'POST',
        body: {
          type: 'multipart',
          fields: [{ id: '2', kind: 'file', key: 'f', filePath: '/etc/passwd', enabled: true }],
        },
      }),
    );
    expect(e.kind).toBe('file');
  });
});

describe('auth', () => {
  it('adds bearer auth', async () => {
    const e = echo(await send({ auth: { type: 'bearer', token: 'abc' } }));
    expect(e.headers['authorization']).toBe('Bearer abc');
  });

  it('adds basic auth', async () => {
    const e = echo(await send({ auth: { type: 'basic', username: 'u', password: 'p:w' } }));
    expect(e.headers['authorization']).toBe(`Basic ${Buffer.from('u:p:w').toString('base64')}`);
  });

  it('lets an explicit Authorization header win', async () => {
    const e = echo(
      await send({
        headers: [kv('Authorization', 'Custom x')],
        auth: { type: 'bearer', token: 'abc' },
      }),
    );
    expect(e.headers['authorization']).toBe('Custom x');
  });
});

describe('variables', () => {
  it('resolves variables everywhere', async () => {
    const e = echo(
      await send(
        {
          url: '{{base}}/echo?q={{q}}',
          method: 'POST',
          headers: [kv('X-Token', '{{token}}')],
          body: { type: 'json', content: '{"q":"{{q}}"}' },
          auth: { type: 'bearer', token: '{{token}}' },
        },
        { base: server.url, q: 'hello', token: 't0k' },
      ),
    );
    expect(e.url).toBe('/echo?q=hello');
    expect(e.headers['x-token']).toBe('t0k');
    expect(e.body).toBe('{"q":"hello"}');
    expect(e.headers['authorization']).toBe('Bearer t0k');
  });

  it('blocks the send when variables are unresolved', async () => {
    const e = err(await send({ url: '{{base}}/echo', headers: [kv('X', '{{missing}}')] }));
    expect(e.kind).toBe('unresolved');
    expect(e.missing).toEqual(['base', 'missing']);
  });
});

describe('status codes', () => {
  it.each([200, 201, 301, 400, 404, 418, 500, 503])('returns %i', async (code) => {
    const r = ok(await send({ url: `${server.url}/status/${code}` }));
    expect(r.status).toBe(code);
    expect(r.statusText).not.toBe('');
  });

  it('handles 204 with no body', async () => {
    const r = ok(await send({ url: `${server.url}/empty` }));
    expect(r.status).toBe(204);
    expect(r.bodyText).toBe('');
    expect(r.isBinary).toBe(false);
  });

  it('handles an empty gzip body', async () => {
    const r = ok(await send({ url: `${server.url}/empty-gzip` }));
    expect(r.bodyText).toBe('');
  });
});

describe('redirects', () => {
  it.each([301, 302, 303])('%i changes POST to GET and drops the body', async (code) => {
    const r = await send({
      method: 'POST',
      url: `${server.url}/redirect/${code}?to=/echo`,
      body: { type: 'json', content: '{"a":1}' },
    });
    const e = echo(r);
    expect(e.method).toBe('GET');
    expect(e.body).toBe('');
    expect(e.headers['content-type']).toBeUndefined();
    expect(ok(r).redirectCount).toBe(1);
    expect(ok(r).finalUrl).toBe(`${server.url}/echo`);
  });

  it.each([307, 308])('%i keeps the method and body', async (code) => {
    const e = echo(
      await send({
        method: 'POST',
        url: `${server.url}/redirect/${code}?to=/echo`,
        body: { type: 'json', content: '{"a":1}' },
      }),
    );
    expect(e.method).toBe('POST');
    expect(e.body).toBe('{"a":1}');
  });

  it('303 keeps HEAD as HEAD', async () => {
    const r = ok(await send({ method: 'HEAD', url: `${server.url}/redirect/303?to=/echo` }));
    expect(r.redirectCount).toBe(1);
    expect(r.status).toBe(200);
  });

  it('301 keeps PUT as PUT', async () => {
    const e = echo(
      await send({
        method: 'PUT',
        url: `${server.url}/redirect/301?to=/echo`,
        body: { type: 'text', content: 'x' },
      }),
    );
    expect(e.method).toBe('PUT');
  });

  it('keeps credentials on same-origin redirects', async () => {
    const e = echo(
      await send({
        url: `${server.url}/redirect/302?to=/echo`,
        headers: [kv('Cookie', 'c=1')],
        auth: { type: 'bearer', token: 'abc' },
      }),
    );
    expect(e.headers['authorization']).toBe('Bearer abc');
    expect(e.headers['cookie']).toBe('c=1');
  });

  it('strips Authorization and Cookie across origins', async () => {
    const e = echo(
      await send({
        url: `${server.url}/redirect/302?to=${encodeURIComponent(`${server.altUrl}/echo`)}`,
        headers: [kv('Cookie', 'c=1'), kv('X-Keep', 'yes')],
        auth: { type: 'bearer', token: 'abc' },
      }),
    );
    expect(e.headers['authorization']).toBeUndefined();
    expect(e.headers['cookie']).toBeUndefined();
    expect(e.headers['x-keep']).toBe('yes');
  });

  it('follows up to 10 redirects', async () => {
    const r = ok(await send({ url: `${server.url}/redirect-chain/10` }));
    expect(r.redirectCount).toBe(10);
    expect(r.status).toBe(200);
  });

  it('fails after too many redirects', async () => {
    expect(err(await send({ url: `${server.url}/redirect-loop` })).kind).toBe('tooManyRedirects');
  });

  it('returns the redirect itself when following is off', async () => {
    const r = ok(
      await send({
        url: `${server.url}/redirect/302?to=/echo`,
        options: { ...DEFAULT_OPTIONS, followRedirects: false },
      }),
    );
    expect(r.status).toBe(302);
    expect(r.headers).toContainEqual(['Location', '/echo']);
  });
});

describe('compression', () => {
  it.each(['gzip', 'deflate', 'deflate-raw', 'brotli'])('decodes %s', async (route) => {
    const r = ok(await send({ url: `${server.url}/${route}` }));
    expect(JSON.parse(r.bodyText).compressed).toBe(true);
    expect(r.wireSizeBytes).toBeLessThan(r.decodedSizeBytes);
  });

  it('shows raw bytes for unsupported encodings', async () => {
    const r = ok(await send({ url: `${server.url}/unknown-encoding` }));
    expect(r.isBinary).toBe(true);
    expect(r.undecodedEncoding).toBe('x-custom');
    expect(r.decodedSizeBytes).toBe(4);
  });

  it('keeps a user-set Accept-Encoding', async () => {
    const r = ok(
      await send({
        url: `${server.url}/accept-encoding`,
        headers: [kv('Accept-Encoding', 'identity')],
      }),
    );
    expect(r.bodyText).toBe('identity');
  });
});

describe('decoding', () => {
  it('decodes ISO-8859-1', async () => {
    expect(ok(await send({ url: `${server.url}/latin1` })).bodyText).toBe(fixtures.LATIN1_TEXT);
  });

  it('decodes Shift_JIS', async () => {
    expect(ok(await send({ url: `${server.url}/shift-jis` })).bodyText).toBe('日本');
  });

  it('detects binary by content type', async () => {
    const r = ok(await send({ url: `${server.url}/binary` }));
    expect(r.isBinary).toBe(true);
    expect(r.bodyText).toBe('');
    expect(r.decodedSizeBytes).toBe(1024);
    expect(client.getBody('tab1')?.data.length).toBe(1024);
  });

  it('detects binary by null bytes', async () => {
    expect(ok(await send({ url: `${server.url}/binary-untyped` })).isBinary).toBe(true);
  });

  it('keeps duplicate headers in order', async () => {
    const r = ok(await send({ url: `${server.url}/dup-headers` }));
    const cookies = r.headers.filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v);
    expect(cookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(r.headers.filter(([k]) => k.toLowerCase() === 'x-multi')).toHaveLength(2);
  });

  it('returns big integers as untouched text', async () => {
    const r = ok(await send({ url: `${server.url}/bigint` }));
    expect(r.bodyText).toBe(fixtures.BIG_JSON);
    expect(r.bodyText).toContain('12345678901234567890');
  });
});

describe('large responses', () => {
  it('truncates the preview at 5 MB but keeps the full body', async () => {
    const r = ok(await send({ url: `${server.url}/large?mb=6` }));
    expect(r.isTruncated).toBe(true);
    expect(r.bodyText.length).toBe(5 * 1024 * 1024);
    expect(r.decodedSizeBytes).toBe(6 * 1024 * 1024);
    expect(client.getBody('tab1')?.data.length).toBe(6 * 1024 * 1024);
  });

  it('releases the stored body', () => {
    client.release('tab1');
    expect(client.getBody('tab1')).toBeUndefined();
  });

  it('aborts above the size limit', async () => {
    const small = new HttpClient({ userAgent: 't', maxBodyBytes: 1024 * 1024 });
    const r = await small.send({
      sendId: 'big',
      tabId: 't',
      request: spec({ url: `${server.url}/large?mb=3` }),
      variables: {},
    });
    expect(err(r).kind).toBe('tooLarge');
    expect(small.getBody('t')).toBeUndefined();
    await small.close();
  });
});

describe('errors', () => {
  it('reports DNS failures', async () => {
    const e = err(await send({ url: 'http://does-not-exist.invalid/' }));
    expect(e.kind).toBe('dns');
  });

  it('reports refused connections', async () => {
    const port = await new Promise<number>((resolve) => {
      const s = createServer().listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => resolve(p));
      });
    });
    expect(err(await send({ url: `http://127.0.0.1:${port}/` })).kind).toBe('refused');
  });

  it('reports TLS failures for self-signed certificates', async () => {
    const e = err(await send({ url: `${server.httpsUrl}/echo` }));
    expect(e.kind).toBe('tls');
  });

  it('skips TLS verification when asked', async () => {
    const r = ok(
      await send({
        url: `${server.httpsUrl}/echo`,
        options: { ...DEFAULT_OPTIONS, verifyTls: false },
      }),
    );
    expect(r.status).toBe(200);
  });

  it('times out waiting for headers', async () => {
    const started = Date.now();
    const e = err(
      await send({
        url: `${server.url}/slow?ms=5000`,
        options: { ...DEFAULT_OPTIONS, timeoutMs: 300 },
      }),
    );
    expect(e.kind).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('times out waiting for the body', async () => {
    const e = err(
      await send({
        url: `${server.url}/drip?ms=5000`,
        options: { ...DEFAULT_OPTIONS, timeoutMs: 300 },
      }),
    );
    expect(e.kind).toBe('timeout');
  });

  it('waits forever when the timeout is 0', async () => {
    const r = ok(
      await send({
        url: `${server.url}/slow?ms=400`,
        options: { ...DEFAULT_OPTIONS, timeoutMs: 0 },
      }),
    );
    expect(r.bodyText).toBe('finally');
  });

  it('cancels a slow request', async () => {
    const pending = send({ url: `${server.url}/slow?ms=5000` }, {}, 'cancel-me');
    await new Promise((r) => setTimeout(r, 100));
    expect(client.cancel('cancel-me')).toBe(true);
    expect(err(await pending).kind).toBe('cancelled');
  });

  it('cancels while reading the body', async () => {
    const pending = send({ url: `${server.url}/drip?ms=5000` }, {}, 'cancel-body');
    await new Promise((r) => setTimeout(r, 150));
    client.cancel('cancel-body');
    expect(err(await pending).kind).toBe('cancelled');
  });

  it('rejects invalid URLs', async () => {
    expect(err(await send({ url: 'http://' })).kind).toBe('invalidUrl');
    expect(err(await send({ url: 'ftp://example.com' })).kind).toBe('invalidUrl');
    expect(err(await send({ url: '' })).kind).toBe('invalidUrl');
  });

  it('rejects invalid header names', async () => {
    expect(err(await send({ headers: [kv('Bad Header', 'x')] })).kind).toBe('invalidRequest');
  });
});
