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
} as const;

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}
