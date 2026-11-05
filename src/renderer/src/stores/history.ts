import { create } from 'zustand';
import type { HistoryEntry } from '@shared/types';
import { newId } from '../lib/id';
import { toSpec } from '../lib/requests';
import { setSendListener } from './tabs';

const LIMIT = 200;

interface HistoryState {
  entries: HistoryEntry[];
  load(entries: HistoryEntry[]): void;
  remove(id: string): void;
  clear(): void;
}

export const useHistory = create<HistoryState>((set) => ({
  entries: [],
  load: (entries) => set({ entries }),
  remove: (id) => {
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    void window.api.deleteHistory(id);
  },
  clear: () => {
    set({ entries: [] });
    void window.api.clearHistory();
  },
}));

// Record every completed send. Requests blocked before sending (unresolved variables, bad URL)
// and cancelled sends are not recorded. The main process strips secrets before writing.
setSendListener((request, result) => {
  if (
    result.status === 'error' &&
    ['unresolved', 'invalidUrl', 'cancelled', 'file'].includes(result.error.kind)
  )
    return;
  const done = result.status === 'done' ? result.response : null;
  void window.api
    .addHistory({
      id: newId(),
      sentAt: Date.now(),
      request: toSpec(request),
      status: done?.status ?? null,
      durationMs: done?.durationMs ?? null,
      error: result.status === 'error' ? result.error.message : null,
    })
    .then((stored) =>
      useHistory.setState((s) => ({ entries: [stored, ...s.entries].slice(0, LIMIT) })),
    );
});
