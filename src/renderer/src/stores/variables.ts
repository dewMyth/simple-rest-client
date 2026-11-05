import { useMemo } from 'react';
import { variablesToMap } from '@shared/variables';
import { useEnvironments } from './environments';

/** Names defined (and enabled) in the active environment. */
export function useKnownVariables(): Set<string> {
  const env = useEnvironments((s) => s.environments.find((e) => e.id === s.activeId));
  return useMemo(() => new Set(Object.keys(env ? variablesToMap(env.variables) : {})), [env]);
}
