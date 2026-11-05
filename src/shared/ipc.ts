/** Actions triggered from the native menu (or its accelerators) and forwarded to the renderer. */
export const MENU_ACTIONS = [
  'send',
  'save',
  'newTab',
  'closeTab',
  'focusUrl',
  'searchResponse',
  'nextTab',
  'prevTab',
] as const;

export type MenuAction = (typeof MENU_ACTIONS)[number];

export const IPC = {
  menuAction: 'menu:action',
  appInfo: 'app:info',
  httpSend: 'http:send',
  httpCancel: 'http:cancel',
  httpRelease: 'http:release',
  pickFile: 'dialog:pickFile',
  saveResponse: 'dialog:saveResponse',
  copyText: 'clipboard:writeText',
} as const;

export interface PickedFile {
  path: string;
  name: string;
}

export type SaveResult = { saved: true; path: string } | { saved: false; error?: string };

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}
