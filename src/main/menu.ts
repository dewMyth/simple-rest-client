import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron';
import { IPC, type MenuAction } from '@shared/ipc';
import { isDev } from './security';

function send(action: MenuAction) {
  return (): void => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    win?.webContents.send(IPC.menuAction, action);
  };
}

function requestItems(): MenuItemConstructorOptions[] {
  return [
    { label: 'New Tab', accelerator: 'CommandOrControl+T', click: send('newTab') },
    { label: 'Save Request', accelerator: 'CommandOrControl+S', click: send('save') },
    { label: 'Close Tab', accelerator: 'CommandOrControl+W', click: send('closeTab') },
    { type: 'separator' },
    { label: 'Import Collections or Environments…', click: send('importCollection') },
    { type: 'separator' },
    { label: 'Send Request', accelerator: 'CommandOrControl+Enter', click: send('send') },
    { label: 'Focus URL', accelerator: 'CommandOrControl+L', click: send('focusUrl') },
  ];
}

function editMenu(): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Find in Response',
        accelerator: 'CommandOrControl+F',
        click: send('searchResponse'),
      },
    ],
  };
}

function viewMenu(): MenuItemConstructorOptions {
  const items: MenuItemConstructorOptions[] = [
    { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: send('nextTab') },
    { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: send('prevTab') },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
  if (isDev) items.push({ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' });
  return { label: 'View', submenu: items };
}

function showAbout(): void {
  void dialog.showMessageBox({
    type: 'info',
    title: `About ${app.getName()}`,
    message: app.getName(),
    detail: `Version ${app.getVersion()}\nA fast, local-first REST client.`,
  });
}

export function buildMenu(): Menu {
  const template: MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          {
            label: app.getName(),
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
          { label: 'File', submenu: requestItems() },
          editMenu(),
          viewMenu(),
          {
            label: 'Window',
            submenu: [
              { role: 'minimize' },
              { role: 'zoom' },
              { type: 'separator' },
              { role: 'front' },
            ],
          },
        ]
      : [
          { label: 'File', submenu: [...requestItems(), { type: 'separator' }, { role: 'quit' }] },
          editMenu(),
          viewMenu(),
          { label: 'Help', submenu: [{ label: `About ${app.getName()}`, click: showAbout }] },
        ];
  return Menu.buildFromTemplate(template);
}
