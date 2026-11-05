import { create } from 'zustand';

export type Dialog =
  | { kind: 'save'; tabId: string; thenClose: boolean }
  | { kind: 'closeTab'; tabId: string }
  | { kind: 'environments'; selectedId: string | null }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      danger?: boolean;
      onConfirm: () => void;
    };

interface UiState {
  dialog: Dialog | null;
  warnings: string[];
  /** Short-lived confirmation, e.g. "Copied as cURL". */
  notice: string | null;
  ready: boolean;
  /** Collection or request currently being renamed inline in the sidebar. */
  renaming: { collectionId: string; requestId?: string } | null;
  openDialog(d: Dialog): void;
  closeDialog(): void;
  addWarnings(w: string[]): void;
  notify(message: string): void;
  dismissWarning(index: number): void;
  setReady(): void;
  setRenaming(r: UiState['renaming']): void;
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null;

export const useUi = create<UiState>((set) => ({
  dialog: null,
  warnings: [],
  notice: null,
  ready: false,
  renaming: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  addWarnings: (w) => set((s) => ({ warnings: [...s.warnings, ...w] })),
  notify: (message) => {
    set({ notice: message });
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => set({ notice: null }), 2000);
  },
  dismissWarning: (i) => set((s) => ({ warnings: s.warnings.filter((_, j) => j !== i) })),
  setReady: () => set({ ready: true }),
  setRenaming: (renaming) => set({ renaming }),
}));
