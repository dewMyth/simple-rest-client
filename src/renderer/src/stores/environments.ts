import { create } from 'zustand';
import type { Environment, KeyValue } from '@shared/types';
import { variablesToMap } from '@shared/variables';
import { newId } from '../lib/id';
import { setVariableSource } from './tabs';

interface EnvironmentsState {
  environments: Environment[];
  activeId: string | null;
  load(environments: Environment[], activeId: string | null): void;
  setActive(id: string | null): void;
  create(name: string): Environment;
  rename(id: string, name: string): void;
  setVariables(id: string, variables: KeyValue[]): void;
  duplicate(id: string): Environment | undefined;
  remove(id: string): void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Variable edits arrive per keystroke, so environment saves are debounced. */
function persist(e: Environment | undefined, immediate = false): void {
  if (!e) return;
  const pending = timers.get(e.id);
  if (pending) clearTimeout(pending);
  if (immediate) {
    timers.delete(e.id);
    void window.api.saveEnvironment(e);
    return;
  }
  timers.set(
    e.id,
    setTimeout(() => {
      timers.delete(e.id);
      void window.api.saveEnvironment(e);
    }, 300),
  );
}

function persistOrder(envs: Environment[]): void {
  void window.api.updateSettings({ environmentOrder: envs.map((e) => e.id) });
}

export const useEnvironments = create<EnvironmentsState>((set, get) => {
  const edit = (id: string, fn: (e: Environment) => Environment, immediate = false) => {
    let updated: Environment | undefined;
    set((s) => ({
      environments: s.environments.map((e) => {
        if (e.id !== id) return e;
        updated = fn(e);
        return updated;
      }),
    }));
    persist(updated, immediate);
  };

  return {
    environments: [],
    activeId: null,

    load(environments, activeId) {
      set({
        environments,
        activeId: environments.some((e) => e.id === activeId) ? activeId : null,
      });
    },

    setActive(id) {
      set({ activeId: id });
      void window.api.updateSettings({ activeEnvironmentId: id });
    },

    create(name) {
      const env: Environment = { schemaVersion: 1, id: newId(), name, variables: [] };
      const environments = [...get().environments, env];
      set({ environments });
      persist(env, true);
      persistOrder(environments);
      return env;
    },

    rename(id, name) {
      edit(id, (e) => ({ ...e, name }), true);
    },

    setVariables(id, variables) {
      edit(id, (e) => ({ ...e, variables }));
    },

    duplicate(id) {
      const src = get().environments.find((e) => e.id === id);
      if (!src) return undefined;
      const copy: Environment = {
        ...structuredClone(src),
        id: newId(),
        name: `${src.name} copy`,
        variables: src.variables.map((v) => ({ ...v, id: newId() })),
      };
      const environments = [...get().environments];
      environments.splice(environments.indexOf(src) + 1, 0, copy);
      set({ environments });
      persist(copy, true);
      persistOrder(environments);
      return copy;
    },

    remove(id) {
      const pending = timers.get(id);
      if (pending) clearTimeout(pending);
      timers.delete(id);
      const environments = get().environments.filter((e) => e.id !== id);
      set({ environments });
      void window.api.deleteEnvironment(id);
      persistOrder(environments);
      if (get().activeId === id) get().setActive(null);
    },
  };
});

/** Writes any debounced environment saves now (used before the window unloads). */
export function flushEnvironmentSaves(): void {
  for (const [id, t] of timers) {
    clearTimeout(t);
    const env = useEnvironments.getState().environments.find((e) => e.id === id);
    if (env) void window.api.saveEnvironment(env);
  }
  timers.clear();
}

export function activeVariables(): Record<string, string> {
  const { environments, activeId } = useEnvironments.getState();
  const env = environments.find((e) => e.id === activeId);
  return env ? variablesToMap(env.variables) : {};
}

setVariableSource(activeVariables);
