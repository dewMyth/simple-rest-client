import type { Session } from '@shared/types';
import { useCollections } from '../stores/collections';
import { flushEnvironmentSaves, useEnvironments } from '../stores/environments';
import { useHistory } from '../stores/history';
import { useSettings } from '../stores/settings';
import { fromSessionTab, toSessionTab, useTabs } from '../stores/tabs';
import { useUi } from '../stores/ui';

export interface Loaders {
  /** Called with the loaded data so other stores (environments, history) can fill themselves. */
  onLoaded?: (data: Awaited<ReturnType<typeof window.api.loadAll>>) => void;
}

let sessionTimer: ReturnType<typeof setTimeout> | null = null;

function buildSession(): Session {
  const { tabs, activeId } = useTabs.getState();
  return { schemaVersion: 1, activeTabId: activeId, tabs: tabs.map(toSessionTab) };
}

/** Saves the session about 500 ms after the last change. */
function scheduleSessionSave(): void {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    sessionTimer = null;
    void window.api.saveSession(buildSession());
  }, 500);
}

export function saveLayout(): void {
  const { sidebarWidth, requestFraction } = useSettings.getState();
  void window.api.updateSettings({ layout: { sidebarWidth, requestFraction } });
}

/** Loads everything from disk, restores the session, then starts autosaving. */
export async function initPersistence(loaders: Loaders = {}): Promise<void> {
  const data = await window.api.loadAll();
  useCollections.getState().load(data.collections);
  useEnvironments.getState().load(data.environments, data.settings.activeEnvironmentId);
  useHistory.getState().load(data.history);
  useSettings.getState().load(data.settings.layout);
  useSettings.getState().setDefaultOptions(data.settings.defaultOptions);
  if (data.session && data.session.tabs.length > 0) {
    useTabs.getState().restore(data.session.tabs.map(fromSessionTab), data.session.activeTabId);
  }
  loaders.onLoaded?.(data);
  if (data.warnings.length) useUi.getState().addWarnings(data.warnings);
  useUi.getState().setReady();

  // Only request-level changes matter for the session; responses aren't saved.
  let last = useTabs.getState();
  useTabs.subscribe((state) => {
    const changed =
      state.activeId !== last.activeId ||
      state.tabs.length !== last.tabs.length ||
      state.tabs.some((t, i) => {
        const prev = last.tabs[i];
        return (
          !prev ||
          prev.id !== t.id ||
          prev.request !== t.request ||
          prev.savedRef !== t.savedRef ||
          prev.snapshot !== t.snapshot ||
          prev.requestSection !== t.requestSection ||
          prev.responseSection !== t.responseSection ||
          prev.responseView !== t.responseView
        );
      });
    last = state;
    if (changed) scheduleSessionSave();
  });
  window.addEventListener('beforeunload', () => {
    flushEnvironmentSaves();
    if (sessionTimer) {
      clearTimeout(sessionTimer);
      void window.api.saveSession(buildSession());
    }
  });
}
