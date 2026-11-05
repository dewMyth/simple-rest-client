import { create } from 'zustand';
import type { KeyValue, ResponseResult, SavedRequest, SendError, SessionTab } from '@shared/types';
import { stableStringify } from '@shared/stableStringify';
import { newId } from '../lib/id';
import { createRequest, toSpec } from '../lib/requests';
import { applyParamRows, mergeParamRows, paramRowsFor } from '../lib/url';

export type RequestSection = 'params' | 'headers' | 'body' | 'auth' | 'options';
export type ResponseSection = 'body' | 'headers';

export type ResponseState =
  | { status: 'idle' }
  | { status: 'sending'; sendId: string; startedAt: number }
  | { status: 'done'; response: ResponseResult }
  | { status: 'error'; error: SendError };

/** Where a tab's request is saved, if anywhere. */
export interface SavedRef {
  collectionId: string;
  requestId: string;
}

export interface Tab {
  id: string;
  request: SavedRequest;
  /** Params table rows (enabled rows mirror the URL query). */
  params: KeyValue[];
  savedRef: SavedRef | null;
  /** Serialized request at the last save; the tab is dirty when the draft differs. */
  snapshot: string;
  response: ResponseState;
  requestSection: RequestSection;
  responseSection: ResponseSection;
  responseView: 'pretty' | 'raw';
}

export const serializeRequest = (r: SavedRequest): string => stableStringify(r);

export function isDirty(tab: Tab): boolean {
  return serializeRequest(tab.request) !== tab.snapshot;
}

export function createTab(
  request: SavedRequest = createRequest(),
  savedRef: SavedRef | null = null,
): Tab {
  return {
    id: newId(),
    request,
    params: paramRowsFor(request.url, request.disabledParams),
    savedRef,
    snapshot: serializeRequest(request),
    response: { status: 'idle' },
    requestSection: 'params',
    responseSection: 'body',
    responseView: 'pretty',
  };
}

export function toSessionTab(t: Tab): SessionTab {
  return {
    id: t.id,
    request: t.request,
    savedRef: t.savedRef,
    snapshot: t.snapshot,
    requestSection: t.requestSection,
    responseSection: t.responseSection,
    responseView: t.responseView,
  };
}

export function fromSessionTab(s: SessionTab): Tab {
  return {
    ...createTab(s.request, s.savedRef),
    id: s.id,
    snapshot: s.snapshot,
    requestSection: s.requestSection,
    responseSection: s.responseSection,
    responseView: s.responseView,
  };
}

/** Provides variables from the active environment. Set by the environments store. */
let variableSource: () => Record<string, string> = () => ({});
export function setVariableSource(fn: () => Record<string, string>): void {
  variableSource = fn;
}

/** Called after every send (success or failure) so history can record it. */
let sendListener: ((request: SavedRequest, result: ResponseState) => void) | null = null;
export function setSendListener(fn: typeof sendListener): void {
  sendListener = fn;
}

interface TabsState {
  tabs: Tab[];
  activeId: string;
  newTab(request?: SavedRequest, savedRef?: SavedRef | null): string;
  /** Opens a saved request, or focuses the tab that already has it. */
  openSaved(request: SavedRequest, savedRef: SavedRef): void;
  closeTab(id: string): void;
  setActive(id: string): void;
  cycle(delta: 1 | -1): void;
  updateRequest(id: string, patch: Partial<SavedRequest>): void;
  setUrl(id: string, url: string): void;
  setParams(id: string, rows: KeyValue[]): void;
  setUi(
    id: string,
    patch: Partial<Pick<Tab, 'requestSection' | 'responseSection' | 'responseView'>>,
  ): void;
  markSaved(id: string, request: SavedRequest, savedRef: SavedRef): void;
  /** Replaces all tabs (used by session restore). */
  restore(tabs: Tab[], activeId: string | null): void;
  /** Keeps tabs in step when a saved request is renamed, moved or deleted. */
  renameSaved(ref: SavedRef, name: string): void;
  moveSaved(from: SavedRef, to: SavedRef): void;
  detachSaved(match: (ref: SavedRef) => boolean): void;
  send(id: string): Promise<void>;
  cancel(id: string): void;
}

function sameRef(a: SavedRef | null, b: SavedRef): boolean {
  return !!a && a.collectionId === b.collectionId && a.requestId === b.requestId;
}

const first = createTab();

export const useTabs = create<TabsState>((set, get) => {
  const patchTab = (id: string, fn: (t: Tab) => Tab): void =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)) }));

  return {
    tabs: [first],
    activeId: first.id,

    newTab(request, savedRef = null) {
      const tab = createTab(request, savedRef);
      set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
      return tab.id;
    },

    openSaved(request, savedRef) {
      const existing = get().tabs.find(
        (t) =>
          t.savedRef?.collectionId === savedRef.collectionId &&
          t.savedRef.requestId === savedRef.requestId,
      );
      if (existing) {
        set({ activeId: existing.id });
        return;
      }
      // Reuse an untouched empty tab instead of piling up blank ones.
      const active = get().tabs.find((t) => t.id === get().activeId);
      if (
        active &&
        !active.savedRef &&
        !isDirty(active) &&
        !active.request.url &&
        active.response.status === 'idle'
      ) {
        const tab = createTab(structuredClone(request), savedRef);
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === active.id ? tab : t)), activeId: tab.id }));
        return;
      }
      get().newTab(structuredClone(request), savedRef);
    },

    closeTab(id) {
      const { tabs, activeId } = get();
      const idx = tabs.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const tab = tabs[idx]!;
      if (tab.response.status === 'sending') void window.api.cancelRequest(tab.response.sendId);
      void window.api.releaseResponse(id);
      let rest = tabs.filter((t) => t.id !== id);
      if (rest.length === 0) rest = [createTab()];
      const nextActive =
        activeId === id ? (rest[Math.min(idx, rest.length - 1)]?.id ?? rest[0]!.id) : activeId;
      set({ tabs: rest, activeId: nextActive });
    },

    setActive(id) {
      set({ activeId: id });
    },

    cycle(delta) {
      const { tabs, activeId } = get();
      const idx = tabs.findIndex((t) => t.id === activeId);
      const next = tabs[(idx + delta + tabs.length) % tabs.length];
      if (next) set({ activeId: next.id });
    },

    updateRequest(id, patch) {
      patchTab(id, (t) => ({ ...t, request: { ...t.request, ...patch } }));
    },

    setUrl(id, url) {
      patchTab(id, (t) => {
        const params = mergeParamRows(t.params, url);
        return {
          ...t,
          params,
          request: {
            ...t.request,
            url,
            disabledParams: params.filter((p) => !p.enabled && (p.key || p.value)),
          },
        };
      });
    },

    setParams(id, rows) {
      patchTab(id, (t) => {
        const { url, disabledParams } = applyParamRows(t.request.url, rows);
        return { ...t, params: rows, request: { ...t.request, url, disabledParams } };
      });
    },

    setUi(id, patch) {
      patchTab(id, (t) => ({ ...t, ...patch }));
    },

    markSaved(id, request, savedRef) {
      patchTab(id, (t) => ({ ...t, request, savedRef, snapshot: serializeRequest(request) }));
    },

    restore(tabs, activeId) {
      if (tabs.length === 0) return;
      set({ tabs, activeId: tabs.find((t) => t.id === activeId)?.id ?? tabs[0]!.id });
    },

    renameSaved(ref, name) {
      set((s) => ({
        tabs: s.tabs.map((t) => {
          if (!sameRef(t.savedRef, ref)) return t;
          let snapshot = t.snapshot;
          try {
            snapshot = serializeRequest({ ...(JSON.parse(t.snapshot) as SavedRequest), name });
          } catch {
            // keep the old snapshot
          }
          return { ...t, request: { ...t.request, name }, snapshot };
        }),
      }));
    },

    moveSaved(from, to) {
      set((s) => ({
        tabs: s.tabs.map((t) => (sameRef(t.savedRef, from) ? { ...t, savedRef: to } : t)),
      }));
    },

    detachSaved(match) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.savedRef && match(t.savedRef) ? { ...t, savedRef: null, snapshot: '' } : t,
        ),
      }));
    },

    async send(id) {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab || tab.response.status === 'sending') return;
      const sendId = newId();
      patchTab(id, (t) => ({
        ...t,
        response: { status: 'sending', sendId, startedAt: Date.now() },
      }));
      const request = tab.request;
      let next: ResponseState;
      try {
        const result = await window.api.sendRequest({
          sendId,
          tabId: id,
          request: toSpec(request),
          variables: variableSource(),
        });
        next = result.ok
          ? { status: 'done', response: result.response }
          : { status: 'error', error: result.error };
      } catch (err) {
        next = {
          status: 'error',
          error: { kind: 'invalidRequest', message: (err as Error).message },
        };
      }
      // Ignore results from a send the user already replaced or cancelled.
      const current = get().tabs.find((t) => t.id === id);
      if (current?.response.status === 'sending' && current.response.sendId === sendId) {
        patchTab(id, (t) => ({ ...t, response: next }));
      }
      sendListener?.(request, next);
    },

    cancel(id) {
      const tab = get().tabs.find((t) => t.id === id);
      if (tab?.response.status === 'sending') void window.api.cancelRequest(tab.response.sendId);
    },
  };
});

export function useActiveTab(): Tab {
  return useTabs((s) => s.tabs.find((t) => t.id === s.activeId) ?? s.tabs[0]!);
}
