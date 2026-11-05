import { describe, expect, it } from 'vitest';
import { nextRedirect, filterHeaders } from '../../src/main/http/redirects';
import { applyAuth } from '../../src/main/http/auth';
import { charsetOf, decodeText, isBinaryBody } from '../../src/main/http/decode';
import { mapError, normalizeUrl } from '../../src/main/http/client';

describe('nextRedirect', () => {
  const base = new URL('https://a.example/x/y');
  it('resolves relative locations', () => {
    expect(nextRedirect(302, 'GET', base, '../z').url.href).toBe('https://a.example/z');
  });
  it('detects cross-origin hops', () => {
    expect(nextRedirect(302, 'GET', base, 'https://b.example/').crossOrigin).toBe(true);
    expect(nextRedirect(302, 'GET', base, 'http://a.example/').crossOrigin).toBe(true);
    expect(nextRedirect(302, 'GET', base, '/same').crossOrigin).toBe(false);
  });
  it('applies method rules', () => {
    expect(nextRedirect(301, 'POST', base, '/').method).toBe('GET');
    expect(nextRedirect(302, 'DELETE', base, '/').method).toBe('DELETE');
    expect(nextRedirect(303, 'PUT', base, '/')).toMatchObject({ method: 'GET', dropBody: true });
    expect(nextRedirect(303, 'HEAD', base, '/').method).toBe('HEAD');
    expect(nextRedirect(307, 'POST', base, '/')).toMatchObject({ method: 'POST', dropBody: false });
    expect(nextRedirect(308, 'PATCH', base, '/')).toMatchObject({
      method: 'PATCH',
      dropBody: false,
    });
  });
});

describe('filterHeaders', () => {
  const h: [string, string][] = [
    ['authorization', 'x'],
    ['Cookie', 'c'],
    ['Content-Type', 'a/b'],
    ['X-Other', '1'],
  ];
  it('strips credentials case-insensitively', () => {
    expect(filterHeaders(h, { stripCredentials: true, stripBody: false }).map(([k]) => k)).toEqual([
      'Content-Type',
      'X-Other',
    ]);
  });
  it('strips body headers', () => {
    expect(filterHeaders(h, { stripCredentials: false, stripBody: true }).map(([k]) => k)).toEqual([
      'authorization',
      'Cookie',
      'X-Other',
    ]);
  });
});

describe('applyAuth', () => {
  it('skips empty bearer tokens', () => {
    expect(applyAuth([], { type: 'bearer', token: '' })).toEqual([]);
  });
  it('respects an existing header regardless of case', () => {
    expect(
      applyAuth([['AUTHORIZATION', 'x']], { type: 'basic', username: 'a', password: 'b' }),
    ).toEqual([['AUTHORIZATION', 'x']]);
  });
  it('encodes basic credentials as UTF-8', () => {
    const [[, v]] = applyAuth([], { type: 'basic', username: 'ü', password: '' }) as [
      [string, string],
    ];
    expect(Buffer.from(v.slice(6), 'base64').toString('utf8')).toBe('ü:');
  });
});

describe('decode helpers', () => {
  it('parses charsets', () => {
    expect(charsetOf('text/html; charset="ISO-8859-1"')).toBe('ISO-8859-1');
    expect(charsetOf('application/json')).toBeNull();
    expect(charsetOf(null)).toBeNull();
  });
  it('falls back to UTF-8 for unknown charsets', () => {
    expect(decodeText(Buffer.from('héllo'), 'text/plain; charset=bogus', 100).text).toBe('héllo');
  });
  it('drops a split multi-byte character when truncating', () => {
    const buf = Buffer.from('aé'); // é is 2 bytes
    expect(decodeText(buf, null, 2)).toEqual({ text: 'a', truncated: true });
  });
  it('treats JSON and +json as text even with null bytes', () => {
    expect(isBinaryBody(Buffer.from([0]), 'application/problem+json')).toBe(false);
  });
  it('treats SVG as text and PNG as binary', () => {
    expect(isBinaryBody(Buffer.from('<svg/>'), 'image/svg+xml')).toBe(false);
    expect(isBinaryBody(Buffer.from('x'), 'image/png')).toBe(true);
  });
});

describe('normalizeUrl', () => {
  it('adds http:// to bare hosts', () => {
    expect(normalizeUrl('localhost:3000/a').href).toBe('http://localhost:3000/a');
  });
  it('keeps https', () => {
    expect(normalizeUrl(' https://x.dev ').href).toBe('https://x.dev/');
  });
});

describe('mapError', () => {
  const url = new URL('http://api.test:81/');
  it('maps nested cause codes', () => {
    expect(mapError({ cause: { code: 'ENOTFOUND' } }, url, null).kind).toBe('dns');
    expect(mapError({ errors: [{ code: 'ECONNREFUSED' }] }, url, null).kind).toBe('refused');
    expect(mapError({ code: 'CERT_HAS_EXPIRED' }, url, null).kind).toBe('tls');
  });
  it('prefers the abort cause', () => {
    expect(mapError(new Error('aborted'), url, 'cancelled').kind).toBe('cancelled');
    expect(mapError(new Error('aborted'), url, 'timeout', 50).message).toContain('50 ms');
  });
  it('falls back to a generic network error', () => {
    expect(
      mapError(Object.assign(new Error('boom'), { code: 'ECONNRESET' }), url, null),
    ).toMatchObject({
      kind: 'network',
      code: 'ECONNRESET',
    });
  });
});
