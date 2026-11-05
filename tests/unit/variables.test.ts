import { describe, expect, it } from 'vitest';
import {
  findVariables,
  resolveRequest,
  resolveText,
  variablesToMap,
} from '../../src/shared/variables';
import { DEFAULT_OPTIONS } from '../../src/shared/types';

describe('resolveText', () => {
  it('replaces known variables and allows spaces', () => {
    expect(resolveText('{{a}}/{{ b }}', { a: '1', b: '2' })).toEqual({ text: '1/2', missing: [] });
  });
  it('leaves unknown variables and reports them', () => {
    expect(resolveText('x{{nope}}', {})).toEqual({ text: 'x{{nope}}', missing: ['nope'] });
  });
  it('allows empty values', () => {
    expect(resolveText('[{{e}}]', { e: '' }).text).toBe('[]');
  });
  it('does not resolve recursively', () => {
    expect(resolveText('{{a}}', { a: '{{b}}', b: 'x' }).text).toBe('{{b}}');
  });
  it('ignores prototype keys', () => {
    expect(resolveText('{{constructor}}', {}).missing).toEqual(['constructor']);
  });
});

describe('findVariables', () => {
  it('lists unique names in order', () => {
    expect(findVariables('{{b}} {{a}} {{b}}')).toEqual(['b', 'a']);
  });
});

describe('variablesToMap', () => {
  it('uses enabled rows with keys only', () => {
    expect(
      variablesToMap([
        { id: '1', key: 'a', value: '1', enabled: true },
        { id: '2', key: 'b', value: '2', enabled: false },
        { id: '3', key: ' ', value: '3', enabled: true },
      ]),
    ).toEqual({ a: '1' });
  });
});

describe('resolveRequest', () => {
  it('ignores disabled headers', () => {
    const { missing } = resolveRequest(
      {
        method: 'GET',
        url: 'http://x',
        headers: [{ id: '1', key: 'X', value: '{{nope}}', enabled: false }],
        body: { type: 'none' },
        auth: { type: 'none' },
        options: DEFAULT_OPTIONS,
      },
      {},
    );
    expect(missing).toEqual([]);
  });
});
