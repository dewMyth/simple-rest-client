export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type MultipartField =
  | { id: string; kind: 'text'; key: string; value: string; enabled: boolean }
  | { id: string; kind: 'file'; key: string; filePath: string; enabled: boolean };

export type RequestBody =
  | { type: 'none' }
  | { type: 'json'; content: string }
  | { type: 'text'; content: string }
  | { type: 'form'; fields: KeyValue[] }
  | { type: 'multipart'; fields: MultipartField[] };

export type BodyType = RequestBody['type'];

export type Auth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string };

export interface RequestOptions {
  /** Default 30000. 0 means no timeout. */
  timeoutMs: number;
  followRedirects: boolean;
  verifyTls: boolean;
}

export interface SavedRequest {
  id: string;
  name: string;
  method: HttpMethod;
  /** Source of truth for enabled query params. */
  url: string;
  /** Params the user switched off. They are kept out of `url` but remembered here. */
  disabledParams: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: Auth;
  options: RequestOptions;
}

/** The parts of a request that affect what goes over the wire. */
export type HttpRequestSpec = Pick<
  SavedRequest,
  'method' | 'url' | 'headers' | 'body' | 'auth' | 'options'
>;

export interface Collection {
  schemaVersion: 1;
  id: string;
  name: string;
  requests: SavedRequest[];
}

export interface Environment {
  schemaVersion: 1;
  id: string;
  name: string;
  variables: KeyValue[];
}

export interface ResponseResult {
  sendId: string;
  status: number;
  statusText: string;
  /** Ordered, keeps duplicates like Set-Cookie. */
  headers: [string, string][];
  /** Decoded preview, may be truncated. */
  bodyText: string;
  isBinary: boolean;
  isTruncated: boolean;
  durationMs: number;
  wireSizeBytes: number;
  decodedSizeBytes: number;
  finalUrl: string;
  redirectCount: number;
  /** Content-Type of the final response, if any. */
  contentType: string | null;
  /** True when the body is still encoded because the Content-Encoding is unsupported. */
  undecodedEncoding: string | null;
}

export type SendErrorKind =
  | 'unresolved'
  | 'invalidUrl'
  | 'invalidRequest'
  | 'file'
  | 'dns'
  | 'refused'
  | 'tls'
  | 'timeout'
  | 'cancelled'
  | 'tooManyRedirects'
  | 'tooLarge'
  | 'network';

export interface SendError {
  kind: SendErrorKind;
  message: string;
  /** Unresolved variable names, for kind 'unresolved'. */
  missing?: string[];
  /** Underlying error code, if any (e.g. ECONNRESET). */
  code?: string;
}

export type SendResult = { ok: true; response: ResponseResult } | { ok: false; error: SendError };

export interface SendInput {
  sendId: string;
  /** The tab that owns the response. Its stored body is replaced on each send. */
  tabId: string;
  request: HttpRequestSpec;
  /** Variables from the active environment. */
  variables: Record<string, string>;
}

export const DEFAULT_OPTIONS: RequestOptions = {
  timeoutMs: 30000,
  followRedirects: true,
  verifyTls: true,
};
