import { describe, expect, it } from 'vitest';
import { formatBytes, prettyJson, statusClass } from '../../src/renderer/src/lib/format';

describe('prettyJson', () => {
  it('keeps big integers exact', () => {
    const out = prettyJson('{"id":12345678901234567890,"n":-98765432109876543210,"f":1.50e300}');
    expect(out).toBe(
      '{\n  "id": 12345678901234567890,\n  "n": -98765432109876543210,\n  "f": 1.50e300\n}',
    );
  });
  it('formats nested structures and keeps empty containers inline', () => {
    expect(prettyJson('[1,{"a":[],"b":{}},"x"]')).toBe(
      '[\n  1,\n  {\n    "a": [],\n    "b": {}\n  },\n  "x"\n]',
    );
  });
  it('leaves strings with structural characters alone', () => {
    expect(prettyJson('{"s":"a,b:{c}[d] \\"q\\""}')).toBe('{\n  "s": "a,b:{c}[d] \\"q\\""\n}');
  });
  it('returns null for invalid JSON', () => {
    expect(prettyJson('{"a":')).toBeNull();
    expect(prettyJson('')).toBeNull();
  });
  it('re-indents already pretty JSON', () => {
    expect(prettyJson('{\n    "a" :  true\n}')).toBe('{\n  "a": true\n}');
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(3174)).toBe('3.1 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
  });
});

describe('statusClass', () => {
  it('groups by class', () => {
    expect([200, 302, 404, 503, 101].map(statusClass)).toEqual([
      'success',
      'redirect',
      'client',
      'server',
      'info',
    ]);
  });
});
