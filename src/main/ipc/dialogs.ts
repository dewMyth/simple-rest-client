import { BrowserWindow, clipboard, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import { IPC, type PickedFile, type SaveResult } from '@shared/ipc';
import { idSchema } from '@shared/schemas';
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

export function registerDialogIpc(client: HttpClient): void {
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
