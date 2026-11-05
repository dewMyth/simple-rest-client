import { promisify } from 'node:util';
import zlib from 'node:zlib';

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const inflateRaw = promisify(zlib.inflateRaw);
const brotli = promisify(zlib.brotliDecompress);

export class DecodedTooLargeError extends Error {}

export interface DecompressResult {
  data: Buffer;
  /** The first encoding we couldn't decode, in which case `data` is the raw bytes. */
  unsupported: string | null;
}

/**
 * Undoes Content-Encoding. Encodings are applied in order, so they're removed in reverse.
 * Unknown encodings leave the raw bytes in place.
 */
export async function decompress(
  raw: Buffer,
  contentEncoding: string | null,
  maxOutputLength: number,
): Promise<DecompressResult> {
  if (!contentEncoding || raw.length === 0) return { data: raw, unsupported: null };
  const encodings = contentEncoding
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e !== 'identity');
  let data = raw;
  const opts = { maxOutputLength };
  try {
    for (const enc of encodings.reverse()) {
      if (enc === 'gzip' || enc === 'x-gzip') {
        data = await gunzip(data, { ...opts, finishFlush: zlib.constants.Z_SYNC_FLUSH });
      } else if (enc === 'deflate') {
        // Some servers send raw deflate without the zlib wrapper.
        data = await inflate(data, opts).catch(() => inflateRaw(data, opts));
      } else if (enc === 'br') {
        data = await brotli(data, opts);
      } else {
        return { data: raw, unsupported: enc };
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
      throw new DecodedTooLargeError('Decompressed response is too large');
    }
    return { data: raw, unsupported: encodings.join(', ') + ' (corrupt)' };
  }
  return { data, unsupported: null };
}

/** Returns the `charset` parameter of a Content-Type header, if any. */
export function charsetOf(contentType: string | null): string | null {
  if (!contentType) return null;
  const m = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return m?.[1] ?? null;
}

function mimeOf(contentType: string | null): string {
  return (contentType ?? '').split(';')[0]!.trim().toLowerCase();
}

const TEXT_MIME =
  /^(text\/|application\/(json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|x-ndjson|problem\+json|problem\+xml|yaml|x-yaml|toml|sql|csv)$)|\+(json|xml|yaml)$/;
const BINARY_MIME =
  /^(image\/(?!svg)|audio\/|video\/|font\/|application\/(octet-stream|pdf|zip|gzip|x-gzip|x-tar|x-7z-compressed|x-rar-compressed|wasm|vnd\.|msword|x-protobuf|protobuf|grpc))/;

/** Uses the content type first, then looks for a null byte in the first 8 KB. */
export function isBinaryBody(data: Buffer, contentType: string | null): boolean {
  const mime = mimeOf(contentType);
  if (mime && TEXT_MIME.test(mime)) return false;
  if (mime && BINARY_MIME.test(mime)) return true;
  return data.subarray(0, 8192).includes(0);
}

/**
 * Decodes up to `maxBytes` of `data` as text using the declared charset (UTF-8 by default).
 * A multi-byte character split at the cut-off is dropped rather than shown as garbage.
 */
export function decodeText(
  data: Buffer,
  contentType: string | null,
  maxBytes: number,
): { text: string; truncated: boolean } {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charsetOf(contentType) ?? 'utf-8');
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  const truncated = data.length > maxBytes;
  const slice = truncated ? data.subarray(0, maxBytes) : data;
  const text = decoder.decode(slice, { stream: truncated });
  return { text, truncated };
}
