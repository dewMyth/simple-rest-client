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
  'importCollection',
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
  exportCollection: 'dialog:exportCollection',
  importCollections: 'dialog:importCollections',
  copyText: 'clipboard:writeText',
  loadAll: 'storage:loadAll',
  saveCollection: 'storage:saveCollection',
  deleteCollection: 'storage:deleteCollection',
  saveEnvironment: 'storage:saveEnvironment',
  deleteEnvironment: 'storage:deleteEnvironment',
  updateSettings: 'storage:updateSettings',
  saveSession: 'storage:saveSession',
  addHistory: 'storage:addHistory',
  deleteHistory: 'storage:deleteHistory',
  clearHistory: 'storage:clearHistory',
} as const;

export interface PickedFile {
  path: string;
  name: string;
}

export type ExportFormat = 'simplerest' | 'postman';

export interface ImportCollectionsResult {
  canceled: boolean;
  collections: import('./types').Collection[];
  /** Environments from Postman collection variables or Postman environment files. */
  environments: import('./types').Environment[];
  /** Non-fatal notes per file, e.g. "shop.json: Pre-request and test scripts were skipped". */
  notes: string[];
  /** True when at least one imported file says it contains secrets. */
  includesSecrets: boolean;
  /** One message per file that couldn't be imported. */
  errors: string[];
}

export type SaveResult = { saved: true; path: string } | { saved: false; error?: string };

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}
