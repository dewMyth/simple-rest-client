import { useCollections } from '../stores/collections';
import { isDirty, useTabs } from '../stores/tabs';
import { useUi } from '../stores/ui';
import { newId } from './id';
import { requestTitle } from './requests';

/** Cmd+S: updates the saved request in place, or asks where to save a new one. */
export function saveTab(tabId: string, thenClose = false): void {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const ref = tab.savedRef;
  const cols = useCollections.getState();
  if (ref && cols.find(ref.collectionId, ref.requestId)) {
    const request = { ...tab.request, id: ref.requestId };
    cols.updateRequest(ref.collectionId, request);
    useTabs.getState().markSaved(tab.id, request, ref);
    if (thenClose) useTabs.getState().closeTab(tab.id);
    return;
  }
  useUi.getState().openDialog({ kind: 'save', tabId, thenClose });
}

/** Saves a tab's request as a new entry in a collection (creating the collection if needed). */
export function saveTabAs(
  tabId: string,
  name: string,
  target: { collectionId: string } | { newCollectionName: string },
): void {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const cols = useCollections.getState();
  const collectionId =
    'collectionId' in target
      ? target.collectionId
      : cols.create(target.newCollectionName.trim() || 'New Collection').id;
  const request = {
    ...structuredClone(tab.request),
    id: newId(),
    name: name.trim() || requestTitle(tab.request),
  };
  cols.addRequest(collectionId, request);
  useTabs.getState().markSaved(tab.id, request, { collectionId, requestId: request.id });
}

/** Closes a tab, asking first when it has unsaved changes. */
export function requestCloseTab(tabId: string): void {
  const tab = useTabs.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (isDirty(tab)) {
    useUi.getState().openDialog({ kind: 'closeTab', tabId });
    return;
  }
  useTabs.getState().closeTab(tabId);
}
