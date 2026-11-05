import { app, BrowserWindow, ipcMain, Menu, nativeTheme, session } from 'electron';
import { join } from 'node:path';
import { IPC, type AppInfo } from '@shared/ipc';
import { buildMenu } from './menu';
import { HttpClient } from './http/client';
import { registerHttpIpc } from './ipc/http';
import { registerDialogIpc } from './ipc/dialogs';
import { assertTrustedSender, hardenWebContents, isDev, rendererIndexPath } from './security';

app.setName('SimpleRest');

// Lets end-to-end tests run against an isolated, throwaway data folder.
const userDataOverride = process.env['SIMPLEREST_USER_DATA'];
if (userDataOverride) app.setPath('userData', userDataOverride);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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

  win.once('ready-to-show', () => win.show());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(rendererIndexPath());
  }
  return win;
}

let httpClient: HttpClient | null = null;

function registerIpc(): void {
  httpClient = new HttpClient({ userAgent: `SimpleRest/${app.getVersion()}` });
  registerHttpIpc(httpClient);
  registerDialogIpc(httpClient);
  ipcMain.handle(IPC.appInfo, (event): AppInfo => {
    assertTrustedSender(event);
    return { name: app.getName(), version: app.getVersion(), platform: process.platform };
  });
}

app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));

void app.whenReady().then(() => {
  nativeTheme.themeSource = 'system';
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

app.on('will-quit', () => {
  void httpClient?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
