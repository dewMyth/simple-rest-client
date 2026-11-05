import type { HttpMethod } from '@shared/types';

export function methodColor(m: HttpMethod): string {
  switch (m) {
    case 'GET':
      return 'var(--method-get)';
    case 'POST':
      return 'var(--method-post)';
    case 'PUT':
      return 'var(--method-put)';
    case 'PATCH':
      return 'var(--method-patch)';
    case 'DELETE':
      return 'var(--method-delete)';
    default:
      return 'var(--method-other)';
  }
}

export function methodShort(m: HttpMethod): string {
  return m === 'DELETE' ? 'DEL' : m === 'OPTIONS' ? 'OPT' : m;
}
