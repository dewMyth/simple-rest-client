/** JSON.stringify with sorted object keys, so equal values always serialize the same way. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort())
        sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}
