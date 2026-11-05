import type { AppInfo, MenuAction } from './ipc';

/** The complete surface the preload exposes to the renderer as `window.api`. */
export interface SimpleRestApi {
  getAppInfo(): Promise<AppInfo>;
  /** Subscribes to native menu actions. Returns an unsubscribe function. */
  onMenuAction(listener: (action: MenuAction) => void): () => void;
}
