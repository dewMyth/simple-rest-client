import { create } from 'zustand';
import type { Collection, SavedRequest } from '@shared/types';
import { newId } from '../lib/id';
import { useTabs } from './tabs';

interface CollectionsState {
  collections: Collection[];
  load(collections: Collection[]): void;
  create(name: string): Collection;
  /** Adds imported collections (already given fresh ids) to the end of the list. */
  importMany(collections: Collection[]): void;
  rename(id: string, name: string): void;
  remove(id: string): void;
  duplicate(id: string): void;
  /** Moves collection `id` to sit before `beforeId` (or to the end when null). */
  reorder(id: string, beforeId: string | null): void;
  addRequest(collectionId: string, request: SavedRequest): void;
  updateRequest(collectionId: string, request: SavedRequest): void;
  renameRequest(collectionId: string, requestId: string, name: string): void;
  removeRequest(collectionId: string, requestId: string): void;
  duplicateRequest(collectionId: string, requestId: string): void;
  /** Moves a request before `beforeId` in `toCollectionId` (or to its end when null). */
  moveRequest(
    fromCollectionId: string,
    requestId: string,
    toCollectionId: string,
    beforeId: string | null,
  ): void;
  find(collectionId: string, requestId: string): SavedRequest | undefined;
}

function persist(c: Collection | undefined): void {
  if (c) void window.api.saveCollection(c);
}

function persistOrder(collections: Collection[]): void {
  void window.api.updateSettings({ collectionOrder: collections.map((c) => c.id) });
}

function copyName(name: string): string {
  return `${name} copy`;
}

export const useCollections = create<CollectionsState>((set, get) => {
  /** Applies `fn` to one collection, saves it, and returns the updated collection. */
  const edit = (id: string, fn: (c: Collection) => Collection): Collection | undefined => {
    let updated: Collection | undefined;
    set((s) => ({
      collections: s.collections.map((c) => {
        if (c.id !== id) return c;
        updated = fn(c);
        return updated;
      }),
    }));
    persist(updated);
    return updated;
  };

  return {
    collections: [],

    load(collections) {
      set({ collections });
    },

    create(name) {
      const c: Collection = { schemaVersion: 1, id: newId(), name, requests: [] };
      const collections = [...get().collections, c];
      set({ collections });
      persist(c);
      persistOrder(collections);
      return c;
    },

    importMany(imported) {
      if (imported.length === 0) return;
      const collections = [...get().collections, ...imported];
      set({ collections });
      imported.forEach(persist);
      persistOrder(collections);
    },

    rename(id, name) {
      edit(id, (c) => ({ ...c, name }));
    },

    remove(id) {
      const collections = get().collections.filter((c) => c.id !== id);
      set({ collections });
      void window.api.deleteCollection(id);
      persistOrder(collections);
      useTabs.getState().detachSaved((ref) => ref.collectionId === id);
    },

    duplicate(id) {
      const src = get().collections.find((c) => c.id === id);
      if (!src) return;
      const copy: Collection = {
        ...structuredClone(src),
        id: newId(),
        name: copyName(src.name),
        requests: src.requests.map((r) => ({ ...structuredClone(r), id: newId() })),
      };
      const idx = get().collections.indexOf(src);
      const collections = [...get().collections];
      collections.splice(idx + 1, 0, copy);
      set({ collections });
      persist(copy);
      persistOrder(collections);
    },

    reorder(id, beforeId) {
      if (id === beforeId) return;
      const list = [...get().collections];
      const moving = list.find((c) => c.id === id);
      if (!moving) return;
      const rest = list.filter((c) => c.id !== id);
      const at = beforeId ? rest.findIndex((c) => c.id === beforeId) : -1;
      rest.splice(at === -1 ? rest.length : at, 0, moving);
      set({ collections: rest });
      persistOrder(rest);
    },

    addRequest(collectionId, request) {
      edit(collectionId, (c) => ({ ...c, requests: [...c.requests, request] }));
    },

    updateRequest(collectionId, request) {
      edit(collectionId, (c) => ({
        ...c,
        requests: c.requests.map((r) => (r.id === request.id ? request : r)),
      }));
    },

    renameRequest(collectionId, requestId, name) {
      edit(collectionId, (c) => ({
        ...c,
        requests: c.requests.map((r) => (r.id === requestId ? { ...r, name } : r)),
      }));
      useTabs.getState().renameSaved({ collectionId, requestId }, name);
    },

    removeRequest(collectionId, requestId) {
      edit(collectionId, (c) => ({ ...c, requests: c.requests.filter((r) => r.id !== requestId) }));
      useTabs
        .getState()
        .detachSaved((ref) => ref.collectionId === collectionId && ref.requestId === requestId);
    },

    duplicateRequest(collectionId, requestId) {
      edit(collectionId, (c) => {
        const idx = c.requests.findIndex((r) => r.id === requestId);
        if (idx === -1) return c;
        const src = c.requests[idx]!;
        const requests = [...c.requests];
        requests.splice(idx + 1, 0, {
          ...structuredClone(src),
          id: newId(),
          name: copyName(src.name),
        });
        return { ...c, requests };
      });
    },

    moveRequest(fromId, requestId, toId, beforeId) {
      if (requestId === beforeId) return;
      const from = get().collections.find((c) => c.id === fromId);
      const req = from?.requests.find((r) => r.id === requestId);
      if (!from || !req) return;
      const insert = (list: SavedRequest[]) => {
        const at = beforeId ? list.findIndex((r) => r.id === beforeId) : -1;
        const next = [...list];
        next.splice(at === -1 ? next.length : at, 0, req);
        return next;
      };
      if (fromId === toId) {
        edit(fromId, (c) => ({
          ...c,
          requests: insert(c.requests.filter((r) => r.id !== requestId)),
        }));
        return;
      }
      edit(toId, (c) => ({ ...c, requests: insert(c.requests) }));
      edit(fromId, (c) => ({ ...c, requests: c.requests.filter((r) => r.id !== requestId) }));
      useTabs
        .getState()
        .moveSaved({ collectionId: fromId, requestId }, { collectionId: toId, requestId });
    },

    find(collectionId, requestId) {
      return get()
        .collections.find((c) => c.id === collectionId)
        ?.requests.find((r) => r.id === requestId);
    },
  };
});
