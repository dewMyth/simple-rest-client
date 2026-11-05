import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';
import { FormData, Response } from 'undici';
import type { RequestBody } from '@shared/types';

export interface BuiltBody {
  body: Buffer | null;
  /** Default Content-Type for this body, used unless the user set one. */
  contentType: string | null;
}

export class BodyFileError extends Error {}

/**
 * Paths the user picked through the main-process file dialog, or that were loaded from the
 * app's own data files. The renderer can't add to this set directly.
 */
const approvedFilePaths = new Set<string>();

export function approveFilePath(path: string): void {
  approvedFilePaths.add(path);
}

export function isApprovedFilePath(path: string): boolean {
  return approvedFilePaths.has(path);
}

/** Serializes a request body to bytes. Bodies are buffered so they can be replayed on 307/308. */
export async function buildBody(body: RequestBody): Promise<BuiltBody> {
  switch (body.type) {
    case 'none':
      return { body: null, contentType: null };
    case 'json':
      return { body: Buffer.from(body.content, 'utf8'), contentType: 'application/json' };
    case 'text':
      return { body: Buffer.from(body.content, 'utf8'), contentType: 'text/plain; charset=utf-8' };
    case 'form': {
      const params = new URLSearchParams();
      for (const f of body.fields) if (f.enabled && f.key) params.append(f.key, f.value);
      return {
        body: Buffer.from(params.toString(), 'utf8'),
        contentType: 'application/x-www-form-urlencoded',
      };
    }
    case 'multipart': {
      const form = new FormData();
      for (const f of body.fields) {
        if (!f.enabled || !f.key) continue;
        if (f.kind === 'text') {
          form.append(f.key, f.value);
          continue;
        }
        if (!f.filePath) continue;
        if (!isApprovedFilePath(f.filePath)) {
          throw new BodyFileError(`Choose the file for "${f.key}" again using the file picker.`);
        }
        let blob: Blob;
        try {
          blob = await openAsBlob(f.filePath);
        } catch {
          throw new BodyFileError(`Can't read the file for "${f.key}": ${f.filePath}`);
        }
        form.append(f.key, blob, basename(f.filePath));
      }
      const encoded = new Response(form);
      const contentType = encoded.headers.get('content-type');
      return { body: Buffer.from(await encoded.arrayBuffer()), contentType };
    }
  }
}
