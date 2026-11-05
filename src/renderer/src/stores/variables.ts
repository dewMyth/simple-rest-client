const EMPTY = new Set<string>();

/** Names defined in the active environment. Replaced by the environments store in M4. */
export function useKnownVariables(): Set<string> {
  return EMPTY;
}
