import type {
  AppInfo,
  ExportFormat,
  ImportCollectionsResult,
  MenuAction,
  PickedFile,
  SaveResult,
} from './ipc';
import type {
  Collection,
  Environment,
  HistoryEntry,
  HttpRequestSpec,
  LoadedData,
  SendInput,
  SendResult,
  Session,
  SettingsPatch,
} from './types';

/** The complete surface the preload exposes to the renderer as `window.api`. */
export interface SimpleRestApi {
  getAppInfo(): Promise<AppInfo>;
  /** Subscribes to native menu actions. Returns an unsubscribe function. */
  onMenuAction(listener: (action: MenuAction) => void): () => void;

  sendRequest(input: SendInput): Promise<SendResult>;
  cancelRequest(sendId: string): Promise<boolean>;
  /** Frees the response body the main process keeps for a tab. */
  releaseResponse(tabId: string): Promise<void>;

  /** Opens the native file picker. The chosen path is approved for multipart uploads. */
  pickFile(): Promise<PickedFile | null>;
  /** Saves the full response body for a tab through a native save dialog. */
  saveResponse(tabId: string): Promise<SaveResult>;
  copyText(text: string): Promise<void>;
  /** Writes a collection (SimpleRest or Postman v2.1 JSON) to a file chosen in a save dialog. */
  exportCollection(
    collection: Collection,
    includeSecrets: boolean,
    format: ExportFormat,
  ): Promise<SaveResult>;
  /**
   * Reads SimpleRest collections, Postman collections and Postman environments chosen in an open
   * dialog. Everything returned has fresh ids and names that don't clash with the ones given.
   */
  importCollections(existing: {
    collectionNames: string[];
    environmentNames: string[];
  }): Promise<ImportCollectionsResult>;

  /** Loads everything from the data folder. Corrupt files are set aside and listed in `warnings`. */
  loadAll(): Promise<LoadedData>;
  saveCollection(collection: Collection): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  saveEnvironment(environment: Environment): Promise<void>;
  deleteEnvironment(id: string): Promise<void>;
  updateSettings(patch: SettingsPatch): Promise<void>;
  saveSession(session: Session): Promise<void>;
  /** Records a sent request. The main process strips secrets before writing. */
  addHistory(
    entry: Omit<HistoryEntry, 'request'> & { request: HttpRequestSpec },
  ): Promise<HistoryEntry>;
  deleteHistory(id: string): Promise<void>;
  clearHistory(): Promise<void>;
}
