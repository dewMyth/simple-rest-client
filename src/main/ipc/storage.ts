import { z } from 'zod';
import { IPC } from '@shared/ipc';
import {
  collectionSchema,
  environmentSchema,
  historyEntrySchema,
  idSchema,
  sessionSchema,
  settingsPatchSchema,
} from '@shared/schemas';
import type { Collection, Session, SettingsPatch } from '@shared/types';
import { approvePathsIn, sanitizeCollection, sanitizeSession } from '../storage/filePaths';
import type { DataStore } from '../storage/store';
import { handle } from './handle';

export function registerStorageIpc(
  store: DataStore,
  onSettings: (patch: SettingsPatch) => void,
): void {
  handle(IPC.loadAll, z.undefined(), async () => {
    const data = await store.loadForRenderer();
    approvePathsIn(data.collections, data.session);
    return data;
  });
  handle(IPC.saveCollection, collectionSchema, (c) =>
    store.saveCollection(sanitizeCollection(c as Collection)),
  );
  handle(IPC.deleteCollection, idSchema, (id) => store.deleteCollection(id));
  handle(IPC.saveEnvironment, environmentSchema, (e) => store.saveEnvironment(e));
  handle(IPC.deleteEnvironment, idSchema, (id) => store.deleteEnvironment(id));
  handle(IPC.updateSettings, settingsPatchSchema, async (patch) => {
    await store.updateSettings(patch as SettingsPatch);
    onSettings(patch as SettingsPatch);
  });
  handle(IPC.saveSession, sessionSchema, (s) => store.saveSession(sanitizeSession(s as Session)));
  handle(IPC.addHistory, historyEntrySchema, (entry) => store.addHistory(entry));
  handle(IPC.deleteHistory, idSchema, (id) => store.deleteHistory(id));
  handle(IPC.clearHistory, z.undefined(), () => store.clearHistory());
}
