/**
 * Serves a checked-out commit's production build on 127.0.0.1 with that commit's own Vercel emulation
 * (scripts/vercel-static-server.ts) and vercel.json, so the readers can test a commit without a public tunnel.
 * Usage: node src/serve-build.ts <checkout directory> <port>. Runs until the job ends.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface StaticServerModule {
  parseDeployment(value: unknown): unknown;
  startVercelStaticServer(options: {
    root: string;
    deployment: unknown;
    protocol: 'http1';
    brotli: boolean;
    port: number;
    upstreamBody: string;
  }): Promise<{ origin: string }>;
}

const [checkoutArgument, portArgument] = process.argv.slice(2);
if (!checkoutArgument || !portArgument || !/^\d+$/.test(portArgument))
  throw new Error('Usage: node src/serve-build.ts <checkout directory> <port>');
const checkout = resolve(checkoutArgument);
const port = Number(portArgument);

const staticServer = (await import(
  pathToFileURL(resolve(checkout, 'scripts', 'vercel-static-server.ts')).href
)) as StaticServerModule;
const configuration: unknown = JSON.parse(await readFile(resolve(checkout, 'vercel.json'), 'utf8'));
const server = await staticServer.startVercelStaticServer({
  root: resolve(checkout, 'dist'),
  deployment: staticServer.parseDeployment(configuration),
  protocol: 'http1',
  brotli: true,
  port,
  upstreamBody: '{"error":"The screen-reader smoke build has no API upstream"}',
});
console.log(`Serving ${resolve(checkout, 'dist')} at ${server.origin}`);
