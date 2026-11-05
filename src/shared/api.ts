import type { AppInfo, MenuAction, PickedFile, SaveResult } from './ipc';
import type { SendInput, SendResult } from './types';

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
}
