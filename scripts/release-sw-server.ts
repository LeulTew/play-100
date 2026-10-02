import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { requireObject, requireText } from '../src/lib/guards';
import { routePattern } from '../src/lib/vercel-routes';
import type { SwBuild } from './release-sw-inputs';

const HTML_TYPE = 'text/html; charset=utf-8';
const contentTypes: Record<string, string> = {
  '.html': HTML_TYPE,
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt',
  '.txt': 'text/plain; charset=utf-8',
};

export function staticProbePath(url: string) {
  const pathname = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname);
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..'))
    throw new Error('Unsafe request path.');
  return pathname;
}

export async function startSwServer(build: SwBuild, port: number) {
  const requests: { path: string; status: number }[] = [];
  const errors: string[] = [];
  // The handler answers every failure itself, so its promise never rejects.
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const pathname = staticProbePath(request.url ?? '/');
        if (!['GET', 'HEAD'].includes(request.method ?? '')) {
          response.writeHead(405).end();
          return;
        }
        if (pathname === '/__release-probe/blank') {
          requests.push({ path: pathname, status: 200 });
          response
            .writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
            })
            .end('<!doctype html><title>Isolated release storage fixture</title>');
          return;
        }
        // This local probe never proxies production Functions or authenticates a visitor.
        if (pathname.startsWith('/api/')) {
          requests.push({ path: pathname, status: 503 });
          response
            .writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            .end('{"error":"Local SW probe has no API upstream"}');
          return;
        }
        const filePath = ['/', '/my-games', '/my-rankings'].includes(pathname) ? '/index.html' : pathname;
        const file = path.join(build.root, filePath);
        let status = 200,
          bytes: Buffer;
        try {
          if (!(await stat(file)).isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
          bytes = await readFile(file);
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
          status = 404;
          bytes = await readFile(path.join(build.root, '404.html'));
        }
        const headers: Record<string, string> = {
          'Content-Type': status === 404 ? HTML_TYPE : (contentTypes[path.extname(file)] ?? 'application/octet-stream'),
        };
        const rules = build.configuration.headers;
        if (!Array.isArray(rules)) throw new Error('Missing deployment header rules.');
        for (const value of rules) {
          const rule = requireObject(value);
          if (!routePattern(requireText(rule.source)).test(pathname)) continue;
          if (!Array.isArray(rule.headers)) throw new Error('Invalid deployment header rule.');
          for (const value of rule.headers) {
            const header = requireObject(value);
            headers[requireText(header.key)] = requireText(header.value);
          }
        }
        requests.push({ path: pathname, status });
        response.writeHead(status, { ...headers, 'Content-Length': bytes.length });
        response.end(request.method === 'HEAD' ? undefined : bytes);
      } catch (error) {
        errors.push(String(error));
        response.writeHead(500).end('Local SW probe server failed.');
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  server.on('error', (error) => errors.push(String(error)));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing loopback server address.');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    errors,
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
