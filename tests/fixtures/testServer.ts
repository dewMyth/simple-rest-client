import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';

export interface TestServer {
  /** e.g. http://127.0.0.1:PORT */
  url: string;
  /** Same server reached through a different origin (http://localhost:PORT). */
  altUrl: string;
  /** HTTPS server with a self-signed certificate. */
  httpsUrl: string;
  close(): Promise<void>;
}

export interface EchoBody {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  rawHeaders: string[];
  body: string;
  bodyBase64: string;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

const BIG_JSON =
  '{"id":12345678901234567890,"small":1,"neg":-98765432109876543210,"float":1.5e300}';
const LATIN1_TEXT = 'Café, naïve façade © ±';

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;
  const q = url.searchParams;
  const parts = path.split('/').filter(Boolean);

  if (path === '/echo' || path.startsWith('/echo/')) {
    const body = await readBody(req);
    const echo: EchoBody = {
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
      rawHeaders: req.rawHeaders,
      body: body.toString('utf8'),
      bodyBase64: body.toString('base64'),
    };
    return json(res, 200, echo);
  }

  if (parts[0] === 'status' && parts[1]) {
    const code = Number(parts[1]);
    await readBody(req);
    res.writeHead(code, { 'Content-Type': 'text/plain' });
    res.end(code === 204 || code === 304 ? undefined : `status ${code}`);
    return;
  }

  // /redirect/:code?to=<path or url>
  if (parts[0] === 'redirect' && parts[1]) {
    await readBody(req);
    res.writeHead(Number(parts[1]), { Location: q.get('to') ?? '/echo' });
    res.end();
    return;
  }

  // /redirect-chain/:n -> n hops then /echo
  if (parts[0] === 'redirect-chain' && parts[1]) {
    const n = Number(parts[1]);
    res.writeHead(302, { Location: n <= 1 ? '/echo' : `/redirect-chain/${n - 1}` });
    res.end();
    return;
  }

  if (path === '/redirect-loop') {
    res.writeHead(302, { Location: '/redirect-loop' });
    res.end();
    return;
  }

  const payload = Buffer.from(JSON.stringify({ compressed: true, text: 'hello '.repeat(50) }));
  if (path === '/gzip') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
    res.end(zlib.gzipSync(payload));
    return;
  }
  if (path === '/deflate') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'deflate' });
    res.end(zlib.deflateSync(payload));
    return;
  }
  if (path === '/deflate-raw') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'deflate' });
    res.end(zlib.deflateRawSync(payload));
    return;
  }
  if (path === '/brotli') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'br' });
    res.end(zlib.brotliCompressSync(payload));
    return;
  }
  if (path === '/unknown-encoding') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Encoding': 'x-custom' });
    res.end(Buffer.from([1, 2, 3, 4]));
    return;
  }
  if (path === '/accept-encoding') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(req.headers['accept-encoding'] ?? '');
    return;
  }

  // /slow?ms=2000 waits before sending headers. /drip?ms=2000 sends headers, then the body late.
  if (path === '/slow') {
    const ms = Number(q.get('ms') ?? 2000);
    const t = setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('finally');
    }, ms);
    res.on('close', () => clearTimeout(t));
    return;
  }
  if (path === '/drip') {
    const ms = Number(q.get('ms') ?? 2000);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('start ');
    const t = setTimeout(() => res.end('end'), ms);
    res.on('close', () => clearTimeout(t));
    return;
  }

  // /large?mb=6 streams `mb` megabytes of text.
  if (path === '/large') {
    const total = Math.round(Number(q.get('mb') ?? 6) * 1024 * 1024);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': String(total),
    });
    const line = Buffer.from('abcdefghijklmnopqrstuvwxyz0123456789 the quick brown fox jumps\n');
    let sent = 0;
    const write = (): void => {
      while (sent < total) {
        const n = Math.min(line.length, total - sent);
        sent += n;
        if (!res.write(n === line.length ? line : line.subarray(0, n))) {
          res.once('drain', write);
          return;
        }
      }
      res.end();
    };
    write();
    return;
  }

  if (path === '/binary') {
    const data = Buffer.alloc(1024);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(data);
    return;
  }
  if (path === '/binary-untyped') {
    res.writeHead(200);
    res.end(Buffer.from([0x50, 0x4b, 0x00, 0x01, 0x02]));
    return;
  }

  if (path === '/latin1') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=iso-8859-1' });
    res.end(Buffer.from(LATIN1_TEXT, 'latin1'));
    return;
  }
  if (path === '/shift-jis') {
    // "日本" in Shift_JIS
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=Shift_JIS' });
    res.end(Buffer.from([0x93, 0xfa, 0x96, 0x7b]));
    return;
  }

  if (path === '/empty') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (path === '/empty-gzip') {
    // Empty body that still claims gzip (seen with HEAD and some proxies).
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
    res.end();
    return;
  }

  if (path === '/dup-headers') {
    res.setHeader('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/']);
    res.setHeader('X-Multi', ['one', 'two']);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('dups');
    return;
  }

  if (path === '/bigint') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(BIG_JSON);
    return;
  }

  json(res, 404, { error: 'not found', path });
}

function listen(server: Server | ReturnType<typeof createHttpsServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

const listener = (req: IncomingMessage, res: ServerResponse): void => {
  handle(req, res).catch((err: unknown) => {
    res.writeHead(500);
    res.end(String(err));
  });
};

export async function startTestServer(): Promise<TestServer> {
  const http = createServer(listener);
  const certDir = join(__dirname, 'certs');
  const https = createHttpsServer(
    { key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) },
    listener,
  );
  const [port, httpsPort] = await Promise.all([listen(http), listen(https)]);
  const close = (s: { close(cb: () => void): void; closeAllConnections(): void }) =>
    new Promise<void>((resolve) => {
      s.closeAllConnections();
      s.close(() => resolve());
    });
  return {
    url: `http://127.0.0.1:${port}`,
    altUrl: `http://localhost:${port}`,
    httpsUrl: `https://127.0.0.1:${httpsPort}`,
    close: async () => {
      await Promise.all([close(http), close(https)]);
    },
  };
}

export const fixtures = { BIG_JSON, LATIN1_TEXT };
