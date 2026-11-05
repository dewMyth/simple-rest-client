import { app, BrowserWindow, clipboard, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import {
  buildCollectionFile,
  CollectionImportError,
  MAX_IMPORT_BYTES,
  parseCollectionFile,
  serializeCollectionFile,
} from '@shared/collectionFile';
import { IPC, type ImportCollectionsResult, type PickedFile, type SaveResult } from '@shared/ipc';
import { collectionSchema, idSchema } from '@shared/schemas';
import type { Collection } from '@shared/types';
import { approveFilePath } from '../http/body';
import type { HttpClient } from '../http/client';
import { handle } from './handle';

const EXTENSIONS: Record<string, string> = {
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'html',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/css': 'css',
  'application/javascript': 'js',
  'text/javascript': 'js',
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/zip': 'zip',
};

/** Suggests a file name from the URL path and content type. Never trusts it for anything but a default. */
export function suggestFileName(finalUrl: string, contentType: string | null): string {
  let name = 'response';
  try {
    const last = basename(new URL(finalUrl).pathname);
    if (last && last !== '/') name = decodeURIComponent(last);
  } catch {
    // keep default
  }
  // eslint-disable-next-line no-control-regex -- strip control chars from file names
  name = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || 'response';
  const mime = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  const ext =
    EXTENSIONS[mime] ?? (mime.endsWith('+json') ? 'json' : mime.endsWith('+xml') ? 'xml' : null);
  if (ext && !extname(name)) name += `.${ext}`;
  return name;
}

function safeBaseName(name: string): string {
  // eslint-disable-next-line no-control-regex -- strip control chars from file names
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  return cleaned.slice(0, 100) || 'collection';
}

export function registerDialogIpc(client: HttpClient): void {
  handle(
    IPC.exportCollection,
    z.object({ collection: collectionSchema, includeSecrets: z.boolean() }),
    async ({ collection, includeSecrets }, event): Promise<SaveResult> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const opts = {
        title: 'Export collection',
        defaultPath: `${safeBaseName(collection.name)}.simplerest.json`,
        filters: [{ name: 'SimpleRest collection', extensions: ['json'] }],
      };
      const result = win
        ? await dialog.showSaveDialog(win, opts)
        : await dialog.showSaveDialog(opts);
      if (result.canceled || !result.filePath) return { saved: false };
      const file = buildCollectionFile(collection as Collection, {
        includeSecrets,
        exportedBy: `SimpleRest/${app.getVersion()}`,
      });
      try {
        await writeFile(result.filePath, serializeCollectionFile(file), 'utf8');
        return { saved: true, path: result.filePath };
      } catch (err) {
        return { saved: false, error: `Couldn't write the file: ${(err as Error).message}` };
      }
    },
  );

  handle(
    IPC.importCollections,
    z.array(z.string()).max(10_000),
    async (existingNames, event): Promise<ImportCollectionsResult> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const opts = {
        title: 'Import collections',
        properties: ['openFile' as const, 'multiSelections' as const],
        filters: [{ name: 'SimpleRest collection', extensions: ['json'] }],
      };
      const result = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      const empty = { collections: [], includesSecrets: false, errors: [] };
      if (result.canceled || result.filePaths.length === 0) return { canceled: true, ...empty };

      const out: ImportCollectionsResult = {
        canceled: false,
        ...empty,
        collections: [],
        errors: [],
      };
      const names = [...existingNames];
      for (const path of result.filePaths) {
        const label = basename(path);
        try {
          if ((await stat(path)).size > MAX_IMPORT_BYTES) {
            throw new CollectionImportError('The file is larger than 50 MB.');
          }
          const parsed = parseCollectionFile(await readFile(path, 'utf8'), {
            newId: randomUUID,
            existingNames: names,
          });
          out.collections.push(...parsed.collections);
          out.includesSecrets ||= parsed.includesSecrets;
          names.push(...parsed.collections.map((c) => c.name));
        } catch (err) {
          const msg = err instanceof CollectionImportError ? err.message : (err as Error).message;
          out.errors.push(`${label}: ${msg}`);
        }
      }
      return out;
    },
  );

  handle(IPC.pickFile, z.undefined(), async (_input, event): Promise<PickedFile | null> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = { properties: ['openFile' as const] };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    approveFilePath(path);
    return { path, name: basename(path) };
  });

  handle(IPC.saveResponse, idSchema, async (tabId, event): Promise<SaveResult> => {
    const stored = client.getBody(tabId);
    if (!stored)
      return { saved: false, error: 'There is no response to save. Send the request again.' };
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = { defaultPath: suggestFileName(stored.finalUrl, stored.contentType) };
    const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (result.canceled || !result.filePath) return { saved: false };
    try {
      await writeFile(result.filePath, stored.data);
      return { saved: true, path: result.filePath };
    } catch (err) {
      return { saved: false, error: `Couldn't save the file: ${(err as Error).message}` };
    }
  });

  handle(IPC.copyText, z.string().max(250 * 1024 * 1024), (text) => {
    clipboard.writeText(text);
  });
}
