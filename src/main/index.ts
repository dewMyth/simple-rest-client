import { app, BrowserWindow, ipcMain, Menu, nativeTheme, screen, session } from 'electron';
import { join } from 'node:path';
import { IPC, type AppInfo } from '@shared/ipc';
import type { Settings } from '@shared/types';
import { buildMenu } from './menu';
import { HttpClient } from './http/client';
import { registerHttpIpc } from './ipc/http';
import { registerDialogIpc } from './ipc/dialogs';
import { registerStorageIpc } from './ipc/storage';
import { DataStore } from './storage/store';
import { assertTrustedSender, hardenWebContents, isDev, rendererIndexPath } from './security';

app.setName('SimpleRest');

// Lets end-to-end tests run against an isolated, throwaway data folder.
const userDataOverride = process.env['SIMPLEREST_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

let httpClient: HttpClient | null = null;
let store: DataStore | null = null;

/** Uses saved bounds only if they still fit on a connected display. */
function initialBounds(settings: Settings): Partial<Electron.Rectangle> {
  const b = settings.windowBounds;
  if (!b) return { width: 1200, height: 800 };
  const area = screen.getDisplayMatching(b).workArea;
  const visible =
    b.x < area.x + area.width - 50 &&
    b.x + b.width > area.x + 50 &&
    b.y >= area.y - 10 &&
    b.y < area.y + area.height - 50;
  return visible
    ? { x: b.x, y: b.y, width: b.width, height: b.height }
    : { width: b.width, height: b.height };
}

function createWindow(): BrowserWindow {
  const settings = store!.getSettings();
  const win = new BrowserWindow({
    ...initialBounds(settings),
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17181b' : '#ffffff',
    title: 'SimpleRest',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: isDev,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    if (settings.windowBounds?.maximized) win.maximize();
    win.show();
  });

  const saveBounds = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const maximized = win.isMaximized();
    const prev = store!.getSettings().windowBounds;
    const b = maximized && prev ? prev : win.getNormalBounds();
    store!.setWindowBounds({ x: b.x, y: b.y, width: b.width, height: b.height, maximized });
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('maximize', saveBounds);
  win.on('unmaximize', saveBounds);

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(rendererIndexPath());
  }
  return win;
}

function registerIpc(): void {
  ipcMain.handle(IPC.appInfo, (event): AppInfo => {
    assertTrustedSender(event);
    return { name: app.getName(), version: app.getVersion(), platform: process.platform };
  });
  httpClient = new HttpClient({ userAgent: `SimpleRest/${app.getVersion()}` });
  registerHttpIpc(httpClient);
  registerDialogIpc(httpClient);
  registerStorageIpc(store!, (patch) => {
    if (patch.theme) nativeTheme.themeSource = patch.theme;
  });
}

app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));

void app.whenReady().then(async () => {
  store = new DataStore(join(app.getPath('userData'), 'data'));
  // Settings are needed for window bounds and theme before the renderer asks for the rest.
  await store.loadInitial();
  nativeTheme.themeSource = store.getSettings().theme;
  // The renderer never needs camera, notifications, etc.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  Menu.setApplicationMenu(buildMenu());
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let flushed = false;
app.on('before-quit', (event) => {
  if (flushed || !store) return;
  event.preventDefault();
  void store
    .flush()
    .catch(() => undefined)
    .finally(() => {
      flushed = true;
      void httpClient?.close();
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
