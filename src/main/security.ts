import { app, shell, type IpcMainInvokeEvent, type WebContents, type WebFrameMain } from 'electron';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

export const isDev = !app.isPackaged && Boolean(devServerUrl);

/** Absolute path of the production renderer entry. */
export function rendererIndexPath(): string {
  return join(__dirname, '../renderer/index.html');
}

/** True when `url` belongs to the app's own renderer (dev server origin or the bundled index.html). */
export function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (devServerUrl && !app.isPackaged) {
      return parsed.origin === new URL(devServerUrl).origin;
    }
    const indexUrl = pathToFileURL(rendererIndexPath());
    return parsed.protocol === 'file:' && parsed.pathname === indexUrl.pathname;
  } catch {
    return false;
  }
}

/** Rejects IPC calls that don't come from the app's own top-level frame. */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame: WebFrameMain | null = event.senderFrame;
  if (!frame || frame.parent !== null || !isAppUrl(frame.url)) {
    throw new Error('Blocked IPC call from an untrusted frame');
  }
}

/** Opens a URL in the user's browser, but only for http(s). */
export async function openExternalSafe(url: string): Promise<void> {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return;
  }
  if (protocol === 'http:' || protocol === 'https:') {
    await shell.openExternal(url);
  }
}

/** Applies navigation and window-creation guards to every web contents the app creates. */
export function hardenWebContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    void openExternalSafe(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}
