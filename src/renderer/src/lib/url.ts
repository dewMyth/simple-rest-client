/**
 * Query-string helpers that work on the raw URL text.
 *
 * We never pass the editor URL through `new URL()`: it would encode `{{variables}}` and
 * normalize the user's text. Params are kept exactly as typed, and rebuilding the URL reuses
 * the original text of every param the user didn't touch.
 */
import type { KeyValue } from '@shared/types';
import { newId } from './id';

export interface UrlParts {
  /** Everything before `?` (or before `#` when there is no query). */
  base: string;
  /** Raw text between `?` and `#`, or null when there's no `?`. */
  query: string | null;
  /** `#fragment` including the `#`, or ''. */
  hash: string;
}

export interface QuerySegment {
  key: string;
  value: string;
  /** The exact text of this segment in the URL. */
  raw: string;
}

export function splitUrl(url: string): UrlParts {
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const q = beforeHash.indexOf('?');
  if (q === -1) return { base: beforeHash, query: null, hash };
  return { base: beforeHash.slice(0, q), query: beforeHash.slice(q + 1), hash };
}

export function parseQuery(query: string | null): QuerySegment[] {
  if (!query) return [];
  return query
    .split('&')
    .filter((s) => s.length > 0)
    .map((raw) => {
      const eq = raw.indexOf('=');
      return eq === -1
        ? { key: raw, value: '', raw }
        : { key: raw.slice(0, eq), value: raw.slice(eq + 1), raw };
    });
}

/** Rebuilds the URL with `params` as its query, reusing untouched segments verbatim. */
export function buildUrl(url: string, params: { key: string; value: string }[]): string {
  const { base, query, hash } = splitUrl(url);
  const existing = parseQuery(query);
  const used = new Array<boolean>(existing.length).fill(false);
  const segments: string[] = [];
  for (const p of params) {
    if (!p.key && !p.value) continue;
    const idx = existing.findIndex((s, i) => !used[i] && s.key === p.key && s.value === p.value);
    if (idx !== -1) {
      used[idx] = true;
      segments.push(existing[idx]!.raw);
    } else {
      segments.push(p.value === '' ? p.key : `${p.key}=${p.value}`);
    }
  }
  if (segments.length === 0) return base + hash;
  return `${base}?${segments.join('&')}${hash}`;
}

/**
 * Re-derives the params table after the user edits the URL. Disabled rows keep their position,
 * enabled slots are filled from the URL in order, and row ids are reused where possible.
 */
export function mergeParamRows(previous: KeyValue[], url: string): KeyValue[] {
  const segments = parseQuery(splitUrl(url).query);
  const result: KeyValue[] = [];
  let next = 0;
  for (const row of previous) {
    if (!row.enabled) {
      result.push(row);
      continue;
    }
    const seg = segments[next];
    if (!seg) continue;
    next++;
    result.push(
      row.key === seg.key && row.value === seg.value
        ? row
        : { ...row, key: seg.key, value: seg.value },
    );
  }
  for (; next < segments.length; next++) {
    const seg = segments[next]!;
    result.push({ id: newId(), key: seg.key, value: seg.value, enabled: true });
  }
  return result;
}

/** Applies an edited params table to the URL. Returns the new URL and the disabled rows. */
export function applyParamRows(
  url: string,
  rows: KeyValue[],
): { url: string; disabledParams: KeyValue[] } {
  const enabled = rows.filter((r) => r.enabled);
  return {
    url: buildUrl(url, enabled),
    disabledParams: rows.filter((r) => !r.enabled && (r.key || r.value)),
  };
}

/** Builds the initial params table from a saved request. */
export function paramRowsFor(url: string, disabledParams: KeyValue[]): KeyValue[] {
  return [...mergeParamRows([], url), ...disabledParams];
}
