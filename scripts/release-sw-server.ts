import { parseDeployment, safePathname, startVercelStaticServer } from './vercel-static-server';
import type { SwBuild } from './release-sw-inputs';

/** A request's path, refusing anything that could reach outside the build archive. */
export const staticProbePath = safePathname;

const BLANK = '<!doctype html><title>Isolated release storage fixture</title>';

/**
 * Serves the verified build archive as its bound vercel.json declares (scripts/vercel-static-server.ts), over plain
 * HTTP on a loopback port, with one extra page: a blank, scriptless document the probe uses to clear storage. It never
 * proxies production Functions or authenticates a visitor.
 */
export async function startSwServer(build: SwBuild, port: number) {
  return startVercelStaticServer({
    root: build.root,
    deployment: parseDeployment(build.configuration),
    protocol: 'http1',
    brotli: false,
    port,
    upstreamBody: '{"error":"Local SW probe has no API upstream"}',
    intercept: (pathname) =>
      pathname === '/__release-probe/blank'
        ? {
            status: 200,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
              'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
            },
            body: BLANK,
          }
        : undefined,
  });
}
