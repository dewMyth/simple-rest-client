import type {
  Collection,
  Environment,
  HistoryEntry,
  HttpRequestSpec,
  LoadedData,
  Session,
  Settings,
  SettingsPatch,
  WindowBounds,
} from '@shared/types';
import { WriteQueue } from './atomicWrite';
import {
  deleteCollection,
  deleteEnvironment,
  loadCollections,
  loadEnvironments,
  saveCollection,
  saveEnvironment,
} from './collections';
import { HISTORY_LIMIT, loadHistory, saveHistory, stripSecrets } from './history';
import type { ReadResult } from './jsonFile';
import { DataPaths } from './paths';
import { loadSession, saveSession } from './session';
import { defaultSettings, loadSettings, saveSettings } from './settings';

function orderBy<T extends { id: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

function warn(label: string, res: ReadResult<unknown>, warnings: string[]): void {
  if (res.status !== 'corrupt') return;
  warnings.push(
    `Your ${label} file couldn't be read: ${res.reason}. ` +
      (res.movedTo
        ? `It was kept as ${res.movedTo.split(/[\\/]/).pop()}.`
        : 'It was left in place.'),
  );
}

/** All reads and writes of the app's JSON data. Holds settings and history in memory. */
export class DataStore {
  readonly paths: DataPaths;
  private readonly queue = new WriteQueue();
  private settings: Settings = defaultSettings();
  private history: HistoryEntry[] = [];
  private boundsTimer: NodeJS.Timeout | null = null;
  private initial: LoadedData | null = null;

  constructor(root: string) {
    this.paths = new DataPaths(root);
  }

  async loadAll(): Promise<LoadedData> {
    const warnings: string[] = [];
    const [cols, envs, settings, session, history] = await Promise.all([
      loadCollections(this.paths),
      loadEnvironments(this.paths),
      loadSettings(this.paths),
      loadSession(this.paths),
      loadHistory(this.paths),
    ]);
    warnings.push(...cols.warnings, ...envs.warnings);
    warn('settings', settings, warnings);
    warn('session', session, warnings);
    warn('history', history, warnings);
    this.settings = settings.status === 'ok' ? settings.value : defaultSettings();
    this.history = history.status === 'ok' ? history.value : [];
    return {
      collections: orderBy(cols.items, this.settings.collectionOrder),
      environments: orderBy(envs.items, this.settings.environmentOrder),
      settings: this.settings,
      session: session.status === 'ok' ? session.value : null,
      history: this.history,
      warnings,
    };
  }

  /** Loads at startup and keeps the result (with its warnings) for the renderer's first request. */
  async loadInitial(): Promise<LoadedData> {
    this.initial = await this.loadAll();
    return this.initial;
  }

  /** Returns the startup load once, then reloads from disk on later calls (e.g. a window reload). */
  async loadForRenderer(): Promise<LoadedData> {
    const data = this.initial ?? (await this.loadAll());
    this.initial = null;
    return data;
  }

  getSettings(): Settings {
    return this.settings;
  }

  saveCollection(c: Collection): Promise<void> {
    return saveCollection(this.paths, this.queue, c);
  }

  deleteCollection(id: string): Promise<void> {
    return deleteCollection(this.paths, this.queue, id);
  }

  saveEnvironment(e: Environment): Promise<void> {
    return saveEnvironment(this.paths, this.queue, e);
  }

  deleteEnvironment(id: string): Promise<void> {
    return deleteEnvironment(this.paths, this.queue, id);
  }

  updateSettings(patch: SettingsPatch): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    return saveSettings(this.paths, this.queue, this.settings);
  }

  /** Window bounds change often while dragging, so writes are debounced. */
  setWindowBounds(bounds: WindowBounds): void {
    this.settings = { ...this.settings, windowBounds: bounds };
    if (this.boundsTimer) clearTimeout(this.boundsTimer);
    this.boundsTimer = setTimeout(() => {
      this.boundsTimer = null;
      void saveSettings(this.paths, this.queue, this.settings);
    }, 500);
  }

  saveSession(s: Session): Promise<void> {
    return saveSession(this.paths, this.queue, s);
  }

  /** Adds a sent request to history with secrets removed. Returns the stored entry. */
  addHistory(
    entry: Omit<HistoryEntry, 'request'> & { request: HttpRequestSpec },
  ): Promise<HistoryEntry> {
    const stored: HistoryEntry = { ...entry, request: stripSecrets(entry.request) };
    this.history = [stored, ...this.history].slice(0, HISTORY_LIMIT);
    return saveHistory(this.paths, this.queue, this.history).then(() => stored);
  }

  deleteHistory(id: string): Promise<void> {
    this.history = this.history.filter((e) => e.id !== id);
    return saveHistory(this.paths, this.queue, this.history);
  }

  clearHistory(): Promise<void> {
    this.history = [];
    return saveHistory(this.paths, this.queue, this.history);
  }

  async flush(): Promise<void> {
    if (this.boundsTimer) {
      clearTimeout(this.boundsTimer);
      this.boundsTimer = null;
      await saveSettings(this.paths, this.queue, this.settings);
    }
    await this.queue.flush();
  }
}
