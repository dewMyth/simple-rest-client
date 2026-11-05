/**
 * Conversion between SimpleRest collections and Postman Collection v2.0 / v2.1 files, plus
 * import of Postman environment files.
 *
 * SimpleRest collections are one level deep, so Postman folders are flattened and the folder
 * path is prefixed to each request name ("Users / Admin / Delete user").
 */
import { stripSecrets } from './secrets';
import {
  DEFAULT_OPTIONS,
  HTTP_METHODS,
  type Auth,
  type Collection,
  type Environment,
  type HttpMethod,
  type KeyValue,
  type MultipartField,
  type RequestBody,
  type SavedRequest,
} from './types';

export const POSTMAN_SCHEMA_V21 =
  'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string =>
  v === undefined || v === null ? '' : typeof v === 'string' ? v : String(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function isPostmanCollection(data: unknown): boolean {
  if (!isObj(data) || !isObj(data['info'])) return false;
  const schema = str((data['info'] as Json)['schema']);
  return schema.includes('schema.getpostman.com/json/collection') || Array.isArray(data['item']);
}

export function isPostmanEnvironment(data: unknown): boolean {
  return (
    isObj(data) &&
    Array.isArray(data['values']) &&
    (data['_postman_variable_scope'] === 'environment' || typeof data['name'] === 'string') &&
    !('item' in data)
  );
}

// ---------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------

export interface PostmanImportOptions {
  newId: () => string;
}

export interface PostmanCollectionImport {
  collection: Collection;
  /** Collection and path variables, as an environment. Null when there are none. */
  environment: Environment | null;
  /** Things that couldn't be carried over, for a non-blocking warning. */
  notes: string[];
}

/** Reads Postman's key/value auth parameters in both v2.1 (array) and v2.0 (object) shapes. */
function authParams(auth: Json, type: string): Record<string, string> {
  const raw = auth[type];
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const p of raw) if (isObj(p)) out[str(p['key'])] = str(p['value']);
  } else if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) out[k] = str(v);
  }
  return out;
}

interface Converted {
  auth: Auth;
  extraHeader?: [string, string];
  extraQuery?: [string, string];
  unsupported?: string;
}

function convertAuth(auth: unknown): Converted {
  if (!isObj(auth)) return { auth: { type: 'none' } };
  const type = str(auth['type']);
  const p = authParams(auth, type);
  switch (type) {
    case 'noauth':
    case '':
      return { auth: { type: 'none' } };
    case 'bearer':
      return { auth: { type: 'bearer', token: p['token'] ?? '' } };
    case 'basic':
      return {
        auth: { type: 'basic', username: p['username'] ?? '', password: p['password'] ?? '' },
      };
    case 'apikey': {
      const key = p['key'] || 'X-Api-Key';
      const value = p['value'] ?? '';
      return p['in'] === 'query'
        ? { auth: { type: 'none' }, extraQuery: [key, value] }
        : { auth: { type: 'none' }, extraHeader: [key, value] };
    }
    default:
      return { auth: { type: 'none' }, unsupported: type };
  }
}

/** Turns Postman path variables (`/users/:id`) into `{{id}}`, returning the names found. */
function convertPathVariables(url: string): { url: string; names: string[] } {
  const names: string[] = [];
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*|\{\{[^}]+\}\}|[^/?#]*)([^?#]*)(.*)$/i.exec(url);
  if (!m) return { url, names };
  const path = m[2]!.replace(
    /(^|\/):([A-Za-z_][A-Za-z0-9_.-]*)(?=\/|$)/g,
    (_all, slash: string, name: string) => {
      names.push(name);
      return `${slash}{{${name}}}`;
    },
  );
  return { url: m[1] + path + m[3], names };
}

/** Builds a URL string from Postman's url object when `raw` is missing. */
function urlFromParts(u: Json): string {
  const protocol = str(u['protocol']);
  const host = Array.isArray(u['host']) ? u['host'].map(str).join('.') : str(u['host']);
  const port = str(u['port']);
  const path = Array.isArray(u['path'])
    ? u['path'].map((s) => (isObj(s) ? str(s['value']) : str(s))).join('/')
    : str(u['path']);
  const query = arr(u['query'])
    .filter((q) => isObj(q) && !q['disabled'])
    .map((q) => {
      const o = q as Json;
      return o['value'] === null || o['value'] === undefined
        ? str(o['key'])
        : `${str(o['key'])}=${str(o['value'])}`;
    })
    .join('&');
  let out = (protocol ? `${protocol}://` : '') + host + (port ? `:${port}` : '');
  if (path) out += (path.startsWith('/') ? '' : '/') + path;
  if (query) out += `?${query}`;
  return out;
}

function keyValues(list: unknown, newId: () => string): KeyValue[] {
  return arr(list)
    .filter(isObj)
    .filter((h) => str(h['key']) || str(h['value']))
    .map((h) => ({
      id: newId(),
      key: str(h['key']),
      value: str(h['value']),
      enabled: !h['disabled'],
    }));
}

const RAW_CONTENT_TYPES: Record<string, string> = {
  xml: 'application/xml',
  html: 'text/html',
  javascript: 'application/javascript',
};

function convertBody(
  body: unknown,
  headers: KeyValue[],
  newId: () => string,
  notes: Set<string>,
): RequestBody {
  if (!isObj(body) || body['disabled']) return { type: 'none' };
  const mode = str(body['mode']);
  const hasCt = (re: RegExp) =>
    headers.some((h) => h.enabled && h.key.toLowerCase() === 'content-type' && re.test(h.value));
  switch (mode) {
    case 'raw': {
      const content = str(body['raw']);
      const language = str(
        isObj(body['options']) && isObj(body['options']['raw'])
          ? body['options']['raw']['language']
          : '',
      );
      if (language === 'json' || hasCt(/json/i)) return { type: 'json', content };
      const ct = RAW_CONTENT_TYPES[language];
      if (ct && !headers.some((h) => h.key.toLowerCase() === 'content-type')) {
        headers.push({ id: newId(), key: 'Content-Type', value: ct, enabled: true });
      }
      return { type: 'text', content };
    }
    case 'urlencoded':
      return { type: 'form', fields: keyValues(body['urlencoded'], newId) };
    case 'formdata': {
      const fields: MultipartField[] = arr(body['formdata'])
        .filter(isObj)
        .map((f) =>
          str(f['type']) === 'file'
            ? {
                id: newId(),
                kind: 'file' as const,
                key: str(f['key']),
                filePath: '',
                enabled: !f['disabled'],
              }
            : {
                id: newId(),
                kind: 'text' as const,
                key: str(f['key']),
                value: str(f['value']),
                enabled: !f['disabled'],
              },
        );
      if (fields.some((f) => f.kind === 'file'))
        notes.add('File fields were imported without their files. Choose the files again.');
      return { type: 'multipart', fields };
    }
    case 'graphql': {
      const g = isObj(body['graphql']) ? body['graphql'] : {};
      const parseVariables = (): unknown => {
        try {
          return g['variables'] ? JSON.parse(str(g['variables'])) : {};
        } catch {
          return {};
        }
      };
      const variables = parseVariables();
      notes.add('GraphQL bodies were converted to JSON bodies.');
      return {
        type: 'json',
        content: JSON.stringify({ query: str(g['query']), variables }, null, 2),
      };
    }
    case 'file':
      notes.add(
        'Binary file bodies were skipped. Choose the file again as a multipart field if needed.',
      );
      return { type: 'none' };
    default:
      return { type: 'none' };
  }
}

/** Converts a Postman collection into a SimpleRest collection and an optional environment. */
export function importPostmanCollection(
  data: unknown,
  opts: PostmanImportOptions,
): PostmanCollectionImport {
  if (!isPostmanCollection(data)) throw new Error("This isn't a Postman collection.");
  const root = data as Json;
  const info = root['info'] as Json;
  const { newId } = opts;
  const notes = new Set<string>();
  const unsupportedAuth = new Set<string>();
  let scripts = 0;
  const pathVars = new Map<string, string>();
  const requests: SavedRequest[] = [];

  const walk = (items: unknown[], prefix: string[], inheritedAuth: unknown) => {
    for (const item of items.filter(isObj)) {
      if (arr(item['event']).length) scripts++;
      const name = str(item['name']) || 'Untitled';
      if (Array.isArray(item['item'])) {
        walk(item['item'], [...prefix, name], item['auth'] ?? inheritedAuth);
        continue;
      }
      const reqRaw = item['request'];
      const req: Json =
        typeof reqRaw === 'string' ? { url: reqRaw, method: 'GET' } : isObj(reqRaw) ? reqRaw : {};

      const methodRaw = str(req['method'] || 'GET').toUpperCase();
      const method: HttpMethod = (HTTP_METHODS as readonly string[]).includes(methodRaw)
        ? (methodRaw as HttpMethod)
        : 'GET';
      if (method !== methodRaw)
        notes.add(`The ${methodRaw} method isn't supported; those requests were imported as GET.`);

      const u = req['url'];
      let url = typeof u === 'string' ? u : isObj(u) ? str(u['raw']) || urlFromParts(u) : '';
      const disabledParams: KeyValue[] = isObj(u)
        ? keyValues(
            arr(u['query']).filter((q) => isObj(q) && q['disabled']),
            newId,
          )
        : [];
      if (isObj(u)) {
        for (const v of arr(u['variable']).filter(isObj)) {
          const key = str(v['key']);
          if (key && !pathVars.has(key)) pathVars.set(key, str(v['value']));
        }
      }
      const converted = convertPathVariables(url);
      url = converted.url;
      for (const n of converted.names) if (!pathVars.has(n)) pathVars.set(n, '');

      const headers = keyValues(req['header'], newId);
      const body = convertBody(req['body'], headers, newId, notes);

      // A request without its own auth inherits from the closest folder, then the collection.
      const a = convertAuth(req['auth'] ?? inheritedAuth);
      if (a.unsupported) unsupportedAuth.add(a.unsupported);
      if (
        a.extraHeader &&
        !headers.some((h) => h.key.toLowerCase() === a.extraHeader![0].toLowerCase())
      ) {
        headers.push({
          id: newId(),
          key: a.extraHeader[0],
          value: a.extraHeader[1],
          enabled: true,
        });
      }
      if (a.extraQuery)
        url += (url.includes('?') ? '&' : '?') + `${a.extraQuery[0]}=${a.extraQuery[1]}`;

      const behavior = isObj(item['protocolProfileBehavior'])
        ? item['protocolProfileBehavior']
        : {};
      requests.push({
        id: newId(),
        name: [...prefix, name].join(' / '),
        method,
        url,
        disabledParams,
        headers,
        body,
        auth: a.auth,
        options: {
          ...DEFAULT_OPTIONS,
          followRedirects: behavior['followRedirects'] !== false,
          verifyTls: behavior['strictSSL'] !== false,
        },
      });
    }
  };
  walk(arr(root['item']), [], root['auth']);

  if (scripts)
    notes.add(
      `Pre-request and test scripts were skipped (${scripts} item${scripts === 1 ? '' : 's'}).`,
    );
  if (unsupportedAuth.size) {
    notes.add(
      `Unsupported auth types were left empty: ${[...unsupportedAuth].join(', ')}. Set auth manually.`,
    );
  }

  const name = str(info['name']) || 'Postman collection';
  const variables: KeyValue[] = arr(root['variable'])
    .filter(isObj)
    .filter((v) => str(v['key']))
    .map((v) => ({
      id: newId(),
      key: str(v['key']),
      value: str(v['value']),
      enabled: !v['disabled'],
    }));
  for (const [key, value] of pathVars) {
    if (!variables.some((v) => v.key === key))
      variables.push({ id: newId(), key, value, enabled: true });
  }
  if (pathVars.size)
    notes.add('Path variables like :id were converted to {{id}} and added to the environment.');

  return {
    collection: { schemaVersion: 1, id: newId(), name, requests },
    environment: variables.length
      ? { schemaVersion: 1, id: newId(), name: `${name} variables`, variables }
      : null,
    notes: [...notes],
  };
}

/** Converts a Postman environment export into a SimpleRest environment. */
export function importPostmanEnvironment(data: unknown, opts: PostmanImportOptions): Environment {
  if (!isPostmanEnvironment(data)) throw new Error("This isn't a Postman environment.");
  const env = data as Json;
  return {
    schemaVersion: 1,
    id: opts.newId(),
    name: str(env['name']) || 'Postman environment',
    variables: arr(env['values'])
      .filter(isObj)
      .filter((v) => str(v['key']))
      .map((v) => ({
        id: opts.newId(),
        key: str(v['key']),
        value: str(v['value']),
        enabled: v['enabled'] !== false,
      })),
  };
}

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

interface PostmanUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query?: { key: string; value: string | null; disabled?: boolean }[];
}

/** Splits a URL (which may contain {{variables}}) into Postman's url object. */
export function toPostmanUrl(raw: string, disabled: KeyValue[]): PostmanUrl {
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/?#]*)([^?#]*)(?:\?([^#]*))?/i.exec(raw);
  const out: PostmanUrl = { raw };
  if (!m) return out;
  const [, protocol, authority = '', path = '', query] = m;
  if (protocol) out.protocol = protocol;
  const portMatch = /^(.*?)(?::(\d+))?$/.exec(authority);
  const host = portMatch?.[1] ?? authority;
  if (portMatch?.[2]) out.port = portMatch[2];
  if (host) out.host = host.startsWith('{{') ? [host] : host.split('.');
  const segments = path.split('/').filter((s, i) => i > 0 || s);
  if (segments.length) out.path = segments;
  const params = (query ?? '')
    .split('&')
    .filter(Boolean)
    .map((seg) => {
      const eq = seg.indexOf('=');
      return eq === -1
        ? { key: seg, value: null }
        : { key: seg.slice(0, eq), value: seg.slice(eq + 1) };
    });
  const off = disabled
    .filter((d) => d.key || d.value)
    .map((d) => ({ key: d.key, value: d.value, disabled: true }));
  if (params.length || off.length) out.query = [...params, ...off];
  return out;
}

function exportAuth(auth: Auth): Json {
  switch (auth.type) {
    case 'bearer':
      return { type: 'bearer', bearer: [{ key: 'token', value: auth.token, type: 'string' }] };
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: auth.username, type: 'string' },
          { key: 'password', value: auth.password, type: 'string' },
        ],
      };
    default:
      return { type: 'noauth' };
  }
}

function exportBody(body: RequestBody): Json | undefined {
  switch (body.type) {
    case 'json':
      return { mode: 'raw', raw: body.content, options: { raw: { language: 'json' } } };
    case 'text':
      return { mode: 'raw', raw: body.content, options: { raw: { language: 'text' } } };
    case 'form':
      return {
        mode: 'urlencoded',
        urlencoded: body.fields.map((f) => ({
          key: f.key,
          value: f.value,
          ...(f.enabled ? {} : { disabled: true }),
        })),
      };
    case 'multipart':
      return {
        mode: 'formdata',
        formdata: body.fields.map((f) =>
          f.kind === 'file'
            ? { key: f.key, type: 'file', src: [], ...(f.enabled ? {} : { disabled: true }) }
            : {
                key: f.key,
                value: f.value,
                type: 'text',
                ...(f.enabled ? {} : { disabled: true }),
              },
        ),
      };
    default:
      return undefined;
  }
}

/** Builds a Postman Collection v2.1 object. Timeouts have no Postman equivalent and are dropped. */
export function exportPostmanCollection(
  collection: Collection,
  opts: { includeSecrets: boolean; postmanId: string },
): Json {
  return {
    info: { _postman_id: opts.postmanId, name: collection.name, schema: POSTMAN_SCHEMA_V21 },
    item: collection.requests.map((original) => {
      const r = opts.includeSecrets ? original : stripSecrets(original);
      const body = exportBody(r.body);
      const behavior: Json = {};
      if (!r.options.followRedirects) behavior['followRedirects'] = false;
      if (!r.options.verifyTls) behavior['strictSSL'] = false;
      return {
        name: r.name || r.url || 'Untitled',
        ...(Object.keys(behavior).length ? { protocolProfileBehavior: behavior } : {}),
        request: {
          method: r.method,
          header: r.headers
            .filter((h) => h.key || h.value)
            .map((h) => ({ key: h.key, value: h.value, ...(h.enabled ? {} : { disabled: true }) })),
          ...(body ? { body } : {}),
          url: toPostmanUrl(r.url, r.disabledParams),
          auth: exportAuth(r.auth),
        },
        response: [],
      };
    }),
  };
}
