import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { SimpleRestApi } from '@shared/api';
import { IPC, MENU_ACTIONS, type MenuAction } from '@shared/ipc';

const api: SimpleRestApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  onMenuAction(listener) {
    const handler = (_event: IpcRendererEvent, action: unknown): void => {
      if (typeof action === 'string' && (MENU_ACTIONS as readonly string[]).includes(action)) {
        listener(action as MenuAction);
      }
    };
    ipcRenderer.on(IPC.menuAction, handler);
    return () => {
      ipcRenderer.removeListener(IPC.menuAction, handler);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
