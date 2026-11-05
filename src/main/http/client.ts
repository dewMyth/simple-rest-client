import { STATUS_CODES } from 'node:http';
import { Agent, request, type Dispatcher } from 'undici';
import type { HttpMethod, ResponseResult, SendError, SendInput, SendResult } from '@shared/types';
import { resolveRequest } from '@shared/variables';
import { applyAuth } from './auth';
import { BodyFileError, buildBody } from './body';
import { DecodedTooLargeError, decodeText, decompress, isBinaryBody } from './decode';
import { filterHeaders, isRedirect, MAX_REDIRECTS, nextRedirect } from './redirects';

export const MAX_BODY_BYTES = 200 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

export interface ClientConfig {
  userAgent: string;
  /** Largest body kept in memory per tab. Defaults to 200 MB. */
  maxBodyBytes?: number;
  /** Largest text preview sent to the renderer. Defaults to 5 MB. */
  maxPreviewBytes?: number;
}

export interface StoredBody {
  data: Buffer;
  contentType: string | null;
  finalUrl: string;
}

type AbortCause = 'cancelled' | 'timeout' | 'tooLarge';

class SendFailure extends Error {
  constructor(readonly error: SendError) {
    super(error.message);
  }
}

const hasHeader = (headers: [string, string][], name: string): boolean =>
  headers.some(([n]) => n.toLowerCase() === name);

function headerValue(raw: string[], name: string): string | null {
  for (let i = 0; i + 1 < raw.length; i += 2) {
    if (raw[i]!.toLowerCase() === name) return raw[i + 1]!;
  }
  return null;
}

function pairs(raw: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) out.push([raw[i]!, raw[i + 1]!]);
  return out;
}

/** Adds http:// when the user leaves out the scheme, then validates the URL. */
export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed)
    throw new SendFailure({ kind: 'invalidUrl', message: 'Enter a URL to send the request.' });
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new SendFailure({ kind: 'invalidUrl', message: `"${trimmed}" isn't a valid URL.` });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SendFailure({
      kind: 'invalidUrl',
      message: `Only http and https URLs are supported, not ${url.protocol.replace(':', '')}.`,
    });
  }
  return url;
}

const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_REVOKED',
  'CERT_UNTRUSTED',
  'CERT_REJECTED',
  'HOSTNAME_MISMATCH',
]);

function errorCodes(err: unknown): string[] {
  const codes: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    const c = (cur as { code?: unknown }).code;
    if (typeof c === 'string') codes.push(c);
    const errors = (cur as { errors?: unknown }).errors;
    if (Array.isArray(errors)) for (const e of errors) codes.push(...errorCodes(e));
    cur = (cur as { cause?: unknown }).cause;
  }
  return codes;
}

/** Maps a low-level failure to a message the user can act on. */
export function mapError(
  err: unknown,
  url: URL | null,
  abortCause: AbortCause | null,
  timeoutMs = 0,
): SendError {
  if (err instanceof SendFailure) return err.error;
  if (abortCause === 'cancelled') return { kind: 'cancelled', message: 'Request cancelled.' };
  if (abortCause === 'timeout') {
    return {
      kind: 'timeout',
      message: `No complete response within ${timeoutMs} ms. The request timed out.`,
    };
  }
  if (abortCause === 'tooLarge' || err instanceof DecodedTooLargeError) {
    return {
      kind: 'tooLarge',
      message: `The response is larger than ${Math.round(MAX_BODY_BYTES / 1024 / 1024)} MB and was stopped.`,
    };
  }
  const host = url?.host ?? 'the server';
  const codes = errorCodes(err);
  const code = codes[0];
  const has = (...c: string[]) => codes.some((x) => c.includes(x));
  if (has('ENOTFOUND', 'EAI_AGAIN', 'EAI_NODATA', 'EAI_NONAME')) {
    return {
      kind: 'dns',
      code,
      message: `Couldn't find ${url?.hostname ?? 'the host'}. Check the address and your connection.`,
    };
  }
  if (has('ECONNREFUSED')) {
    return {
      kind: 'refused',
      code,
      message: `Connection refused by ${host}. Is the server running?`,
    };
  }
  if (
    has('UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT')
  ) {
    return { kind: 'timeout', code, message: `Timed out talking to ${host}.` };
  }
  const tlsCode = codes.find(
    (c) => TLS_CODES.has(c) || c.startsWith('ERR_SSL') || c.startsWith('ERR_TLS'),
  );
  if (tlsCode) {
    return {
      kind: 'tls',
      code: tlsCode,
      message: `TLS certificate problem with ${host} (${tlsCode}). Turn off "Verify TLS" in Options to skip the check.`,
    };
  }
  if (has('UND_ERR_INVALID_ARG', 'ERR_INVALID_CHAR', 'ERR_INVALID_HTTP_TOKEN')) {
    return { kind: 'invalidRequest', code, message: `Invalid request: ${(err as Error).message}` };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { kind: 'network', code, message: `Network error${code ? ` (${code})` : ''}: ${message}` };
}

export class HttpClient {
  private readonly secureAgent = new Agent();
  private readonly active = new Map<string, AbortController>();
  private readonly bodies = new Map<string, StoredBody>();
  private readonly maxBody: number;
  private readonly maxPreview: number;

  constructor(private readonly config: ClientConfig) {
    this.maxBody = config.maxBodyBytes ?? MAX_BODY_BYTES;
    this.maxPreview = config.maxPreviewBytes ?? MAX_PREVIEW_BYTES;
  }

  cancel(sendId: string): boolean {
    const ctrl = this.active.get(sendId);
    if (!ctrl) return false;
    ctrl.abort('cancelled');
    return true;
  }

  /** Frees the stored response body for a tab (on close or before a new send). */
  release(tabId: string): void {
    this.bodies.delete(tabId);
  }

  getBody(tabId: string): StoredBody | undefined {
    return this.bodies.get(tabId);
  }

  async close(): Promise<void> {
    for (const c of this.active.values()) c.abort('cancelled');
    await this.secureAgent.close();
  }

  async send(input: SendInput): Promise<SendResult> {
    this.release(input.tabId);
    const { request: spec, missing } = resolveRequest(input.request, input.variables);
    if (missing.length > 0) {
      return {
        ok: false,
        error: {
          kind: 'unresolved',
          missing,
          message: `Unresolved variables: ${missing.join(', ')}. Add them to the active environment.`,
        },
      };
    }

    const controller = new AbortController();
    this.active.set(input.sendId, controller);
    let abortCause: AbortCause | null = null;
    controller.signal.addEventListener('abort', () => {
      const r: unknown = controller.signal.reason;
      abortCause = r === 'timeout' || r === 'tooLarge' ? r : 'cancelled';
    });
    const { timeoutMs, followRedirects, verifyTls } = spec.options;
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort('timeout'), timeoutMs) : null;
    const insecureAgent = verifyTls ? null : new Agent({ connect: { rejectUnauthorized: false } });
    const dispatcher: Dispatcher = insecureAgent ?? this.secureAgent;

    let url: URL | null = null;
    const started = performance.now();
    try {
      url = normalizeUrl(spec.url);
      let method: HttpMethod = spec.method;
      let built;
      try {
        built = await buildBody(spec.body);
      } catch (e) {
        if (e instanceof BodyFileError) throw new SendFailure({ kind: 'file', message: e.message });
        throw e;
      }
      let body = built.body;

      let headers: [string, string][] = spec.headers
        .filter((h) => h.enabled && h.key.trim())
        .map((h) => [h.key.trim(), h.value]);
      if (body && built.contentType && !hasHeader(headers, 'content-type')) {
        headers.push(['Content-Type', built.contentType]);
      }
      headers = applyAuth(headers, spec.auth);
      if (!hasHeader(headers, 'user-agent')) headers.push(['User-Agent', this.config.userAgent]);
      if (!hasHeader(headers, 'accept')) headers.push(['Accept', '*/*']);
      if (!hasHeader(headers, 'accept-encoding'))
        headers.push(['Accept-Encoding', 'gzip, deflate, br']);

      let redirectCount = 0;
      for (;;) {
        const res = await request(url, {
          method,
          headers: headers.flat(),
          body,
          dispatcher,
          signal: controller.signal,
          responseHeaders: 'raw',
          headersTimeout: 0,
          bodyTimeout: 0,
        });
        const rawHeaders = res.headers as unknown as string[];
        const location = headerValue(rawHeaders, 'location');

        if (followRedirects && isRedirect(res.statusCode) && location) {
          await res.body
            .dump({ limit: 256 * 1024, signal: controller.signal })
            .catch(() => undefined);
          if (redirectCount >= MAX_REDIRECTS) {
            throw new SendFailure({
              kind: 'tooManyRedirects',
              message: `Stopped after ${MAX_REDIRECTS} redirects. The server may be in a redirect loop.`,
            });
          }
          const step = nextRedirect(res.statusCode, method, url, location);
          if (step.url.protocol !== 'http:' && step.url.protocol !== 'https:') {
            throw new SendFailure({
              kind: 'invalidUrl',
              message: `Redirected to an unsupported URL: ${step.url.href}`,
            });
          }
          headers = filterHeaders(headers, {
            stripCredentials: step.crossOrigin,
            stripBody: step.dropBody,
          });
          if (step.dropBody) body = null;
          method = step.method;
          url = step.url;
          redirectCount++;
          continue;
        }

        // Read the body, counting wire bytes and enforcing the size limit.
        const chunks: Buffer[] = [];
        let wire = 0;
        for await (const chunk of res.body) {
          const buf = chunk as Buffer;
          wire += buf.length;
          if (wire > this.maxBody) {
            controller.abort('tooLarge');
            throw new SendFailure(mapError(null, url, 'tooLarge'));
          }
          chunks.push(buf);
        }
        const raw = Buffer.concat(chunks, wire);
        const contentType = headerValue(rawHeaders, 'content-type');
        const { data, unsupported } = await decompress(
          raw,
          headerValue(rawHeaders, 'content-encoding'),
          this.maxBody,
        );
        const durationMs = Math.round(performance.now() - started);
        const isBinary = unsupported !== null || isBinaryBody(data, contentType);
        const preview = isBinary
          ? { text: '', truncated: false }
          : decodeText(data, contentType, this.maxPreview);

        this.bodies.set(input.tabId, { data, contentType, finalUrl: url.href });
        const response: ResponseResult = {
          sendId: input.sendId,
          status: res.statusCode,
          statusText: res.statusText || STATUS_CODES[res.statusCode] || '',
          headers: pairs(rawHeaders),
          bodyText: preview.text,
          isBinary,
          isTruncated: preview.truncated,
          durationMs,
          wireSizeBytes: wire,
          decodedSizeBytes: data.length,
          finalUrl: url.href,
          redirectCount,
          contentType,
          undecodedEncoding: unsupported,
        };
        return { ok: true, response };
      }
    } catch (err) {
      return { ok: false, error: mapError(err, url, abortCause, timeoutMs) };
    } finally {
      if (timer) clearTimeout(timer);
      this.active.delete(input.sendId);
      if (insecureAgent) void insecureAgent.close().catch(() => undefined);
    }
  }
}
