import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { SimpleRestApi } from '@shared/api';
import { IPC, MENU_ACTIONS, type MenuAction } from '@shared/ipc';

const api: SimpleRestApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  sendRequest: (input) => ipcRenderer.invoke(IPC.httpSend, input),
  cancelRequest: (sendId) => ipcRenderer.invoke(IPC.httpCancel, sendId),
  releaseResponse: (tabId) => ipcRenderer.invoke(IPC.httpRelease, tabId),
  pickFile: () => ipcRenderer.invoke(IPC.pickFile),
  saveResponse: (tabId) => ipcRenderer.invoke(IPC.saveResponse, tabId),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),
  loadAll: () => ipcRenderer.invoke(IPC.loadAll),
  saveCollection: (c) => ipcRenderer.invoke(IPC.saveCollection, c),
  deleteCollection: (id) => ipcRenderer.invoke(IPC.deleteCollection, id),
  saveEnvironment: (e) => ipcRenderer.invoke(IPC.saveEnvironment, e),
  deleteEnvironment: (id) => ipcRenderer.invoke(IPC.deleteEnvironment, id),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  saveSession: (session) => ipcRenderer.invoke(IPC.saveSession, session),
  addHistory: (entry) => ipcRenderer.invoke(IPC.addHistory, entry),
  deleteHistory: (id) => ipcRenderer.invoke(IPC.deleteHistory, id),
  clearHistory: () => ipcRenderer.invoke(IPC.clearHistory),
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
