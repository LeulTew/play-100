import type { Server } from 'node:http';
import type { ViteDevServer } from 'vite';

// Exact port column from https://fetch.spec.whatwg.org/#bad-port.
export const FETCH_BAD_PORTS = Object.freeze([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);
const badPorts = new Set(FETCH_BAD_PORTS);
export const FETCH_SAFE_PORT_ATTEMPTS = 10;

export function isFetchBadPort(port: number): boolean {
  return badPorts.has(port);
}

// Narrow structural interfaces let deterministic fakes exercise the same bind loop.
interface HttpListener {
  listen(port: number, host: string, ready: () => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'listening', listener: () => void): unknown;
  close(callback: (error?: Error) => void): unknown;
  address: Server['address'];
}

interface ViteListener {
  listen(): Promise<unknown>;
  close: ViteDevServer['close'];
  httpServer: Pick<Server, 'address'> | null;
}

function boundPort(address: ReturnType<Server['address']> | undefined): number {
  if (
    !address ||
    typeof address === 'string' ||
    !Number.isInteger(address.port) ||
    address.port < 1 ||
    address.port > 65535 ||
    address.address !== '127.0.0.1'
  ) {
    throw new Error('The test server did not bind a TCP port on 127.0.0.1.');
  }
  return address.port;
}

function listenLoopback(server: HttpListener): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (error: Error) => {
      server.off('listening', ready);
      server.off('error', failed);
      reject(error);
    };
    const ready = () => {
      server.off('error', failed);
      resolve();
    };
    server.once('error', failed);
    try {
      server.listen(0, '127.0.0.1', ready);
    } catch (error) {
      server.off('listening', ready);
      server.off('error', failed);
      reject(error);
    }
  });
}

function closeHttp(server: HttpListener): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function closeAfterFailure(close: () => Promise<void>, cause: unknown): Promise<never> {
  try {
    await close();
  } catch (cleanupError) {
    throw new AggregateError([cause, cleanupError], 'Test server startup and cleanup both failed.', {
      cause: cleanupError,
    });
  }
  throw cause;
}

export async function listenOnFetchSafePort(server: HttpListener): Promise<number> {
  for (let attempt = 0; attempt < FETCH_SAFE_PORT_ATTEMPTS; attempt += 1) {
    await listenLoopback(server);
    let port: number;
    try {
      port = boundPort(server.address());
    } catch (error) {
      return closeAfterFailure(() => closeHttp(server), error);
    }
    if (!isFetchBadPort(port)) return port;
    await closeHttp(server);
  }
  throw new Error(`No Fetch-safe loopback port after ${FETCH_SAFE_PORT_ATTEMPTS} HTTP listen attempts.`);
}

export async function createFetchSafeViteServer<T extends ViteListener>(
  create: () => Promise<T>,
): Promise<{ server: T; origin: string }> {
  for (let attempt = 0; attempt < FETCH_SAFE_PORT_ATTEMPTS; attempt += 1) {
    const server = await create();
    let port: number;
    try {
      await server.listen();
      port = boundPort(server.httpServer?.address());
    } catch (error) {
      return closeAfterFailure(() => server.close(), error);
    }
    // Keep the accepted listener bound; never probe, release and re-use its port.
    if (!isFetchBadPort(port)) return { server, origin: `http://127.0.0.1:${port}` };
    await server.close();
  }
  throw new Error(`No Fetch-safe loopback port after ${FETCH_SAFE_PORT_ATTEMPTS} Vite listen attempts.`);
}
