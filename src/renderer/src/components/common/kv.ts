export const inputClass =
  'h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-2 font-mono text-[12.5px] text-fg placeholder:text-fg-faint hover:border-border focus:border-accent focus:bg-bg focus:outline-none';

export function countEnabled(rows: { key: string; enabled: boolean }[]): number {
  return rows.filter((r) => r.enabled && r.key.trim()).length;
}
