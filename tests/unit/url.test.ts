import { describe, expect, it } from 'vitest';
import {
  applyParamRows,
  buildUrl,
  mergeParamRows,
  paramRowsFor,
  parseQuery,
  splitUrl,
} from '../../src/renderer/src/lib/url';

const row = (key: string, value: string, enabled = true, id = key) => ({ id, key, value, enabled });

describe('splitUrl', () => {
  it('splits base, query and hash', () => {
    expect(splitUrl('http://x/a?b=1#h')).toEqual({ base: 'http://x/a', query: 'b=1', hash: '#h' });
    expect(splitUrl('http://x/a#h?no')).toEqual({ base: 'http://x/a', query: null, hash: '#h?no' });
  });
  it('keeps variables untouched', () => {
    expect(splitUrl('{{base}}/u?id={{id}}')).toEqual({
      base: '{{base}}/u',
      query: 'id={{id}}',
      hash: '',
    });
  });
});

describe('parseQuery', () => {
  it('parses raw segments without decoding', () => {
    expect(parseQuery('a=1&b=%20x&c&d==e&&')).toEqual([
      { key: 'a', value: '1', raw: 'a=1' },
      { key: 'b', value: '%20x', raw: 'b=%20x' },
      { key: 'c', value: '', raw: 'c' },
      { key: 'd', value: '=e', raw: 'd==e' },
    ]);
  });
});

describe('buildUrl', () => {
  it('only changes the edited param', () => {
    const url = 'http://x/?a=%7B1%7D&c=&b={{v}}#frag';
    const out = buildUrl(url, [
      { key: 'a', value: '%7B1%7D' },
      { key: 'c', value: '' },
      { key: 'b', value: 'new value' },
    ]);
    expect(out).toBe('http://x/?a=%7B1%7D&c=&b=new value#frag');
  });
  it('drops the ? when no params remain', () => {
    expect(buildUrl('http://x/?a=1', [])).toBe('http://x/');
  });
  it('adds params to a URL without a query', () => {
    expect(buildUrl('{{base}}/p', [{ key: 'q', value: '{{term}}' }])).toBe('{{base}}/p?q={{term}}');
  });
});

describe('param rows', () => {
  it('keeps disabled rows in place when the URL changes', () => {
    const prev = [row('a', '1'), row('off', 'x', false), row('b', '2')];
    const merged = mergeParamRows(prev, 'http://x/?a=1&b=3&c=4');
    expect(merged.map((r) => [r.key, r.value, r.enabled])).toEqual([
      ['a', '1', true],
      ['off', 'x', false],
      ['b', '3', true],
      ['c', '4', true],
    ]);
    expect(merged[0]).toBe(prev[0]);
    expect(merged[2]!.id).toBe('b');
  });
  it('removes enabled rows deleted from the URL', () => {
    expect(mergeParamRows([row('a', '1'), row('b', '2')], 'http://x/?a=1')).toHaveLength(1);
  });
  it('disabling a row removes it from the URL and remembers it', () => {
    const res = applyParamRows('http://x/?a=1&b=2', [row('a', '1'), row('b', '2', false)]);
    expect(res.url).toBe('http://x/?a=1');
    expect(res.disabledParams).toEqual([row('b', '2', false)]);
  });
  it('builds rows from a saved request', () => {
    const rows = paramRowsFor('http://x/?a=1', [row('z', '9', false)]);
    expect(rows.map((r) => r.key)).toEqual(['a', 'z']);
  });
});
