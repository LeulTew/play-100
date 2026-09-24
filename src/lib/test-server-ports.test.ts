import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import {
  FETCH_BAD_PORTS,
  FETCH_SAFE_PORT_ATTEMPTS,
  createFetchSafeViteServer,
  isFetchBadPort,
  listenOnFetchSafePort,
} from './test-server-ports';

function address(port: number): AddressInfo {
  return { address: '127.0.0.1', family: 'IPv4', port };
}

class FakeHttpServer extends EventEmitter {
  events: string[] = [];
  bound: AddressInfo | string | null = null;
  nextPorts = [6000, 12000];
  listenError: Error | undefined;
  closeError: Error | undefined;
  releaseClose: (() => void) | undefined;
  holdClose = false;
  listens = 0;

  listen(port: number, host: string, ready: () => void) {
    this.events.push(`listen:${port}:${host}`);
    this.listens += 1;
    this.once('listening', ready);
    if (this.listenError) this.emit('error', this.listenError);
    else {
      this.bound = address(this.nextPorts.shift() ?? 6000);
      this.emit('listening');
    }
    return this;
  }

  address() {
    return this.bound;
  }

  close(callback: (error?: Error) => void) {
    this.events.push('close');
    const finish = () => {
      this.bound = null;
      this.events.push('closed');
      callback(this.closeError);
    };
    if (this.holdClose) this.releaseClose = finish;
    else finish();
    return this;
  }
}

function fakeVite(port: number, events: string[]) {
  return {
    httpServer: { address: () => address(port) },
    listen: vi.fn(async () => {
      events.push(`listen:${port}`);
    }),
    close: vi.fn(async () => {
      events.push(`close:${port}`);
    }),
  };
}

describe('Fetch-safe test ports', () => {
  it('copies the exact Fetch-spec bad-port table with no duplicates', () => {
    const expected = [
      0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109,
      110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531,
      532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060,
      5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
    ];
    expect(FETCH_BAD_PORTS).toEqual(expected);
    expect(new Set(FETCH_BAD_PORTS).size).toBe(expected.length);
    expect(Object.isFrozen(FETCH_BAD_PORTS)).toBe(true);
    for (let port = 0; port <= 65535; port += 1) {
      if (isFetchBadPort(port) !== expected.includes(port))
        throw new Error(`Incorrect classification for port ${port}`);
    }
  });

  it('does not round or coerce out-of-table values into blocked ports', () => {
    for (const port of [-1, 0.5, 1719.5, 10080.5, 65536, NaN, Infinity, -Infinity]) {
      expect(isFetchBadPort(port)).toBe(false);
    }
    for (const port of [80, 443, 1718, 1721, 6664, 6670, 10079, 10081, 65535]) {
      expect(isFetchBadPort(port)).toBe(false);
    }
  });

  it('retains a good HTTP listener without closing or rebinding it', async () => {
    const server = new FakeHttpServer();
    server.nextPorts = [12000];
    expect(await listenOnFetchSafePort(server)).toBe(12000);
    expect(server.events).toEqual(['listen:0:127.0.0.1']);
    expect(server.bound).toEqual(address(12000));
    expect(server.listenerCount('error')).toBe(0);
  });

  it('waits for HTTP close completion before relistening on the same server', async () => {
    const server = new FakeHttpServer();
    server.holdClose = true;
    const pending = listenOnFetchSafePort(server);
    await Promise.resolve();
    expect(server.events).toEqual(['listen:0:127.0.0.1', 'close']);
    expect(server.listens).toBe(1);
    expect(server.releaseClose).toBeTypeOf('function');
    server.releaseClose!();
    expect(await pending).toBe(12000);
    expect(server.events).toEqual(['listen:0:127.0.0.1', 'close', 'closed', 'listen:0:127.0.0.1']);
    expect(server.bound).toEqual(address(12000));
  });

  it('bounds bad HTTP assignments and closes the final rejected listener', async () => {
    const server = new FakeHttpServer();
    server.nextPorts = [];
    await expect(listenOnFetchSafePort(server)).rejects.toThrow(
      `after ${FETCH_SAFE_PORT_ATTEMPTS} HTTP listen attempts`,
    );
    expect(FETCH_SAFE_PORT_ATTEMPTS).toBe(10);
    expect(server.listens).toBe(10);
    expect(server.events.filter((event) => event === 'closed')).toHaveLength(10);
    expect(server.bound).toBeNull();
  });

  it('propagates HTTP listen errors without retries or leaked error/listening handlers', async () => {
    const server = new FakeHttpServer();
    server.listenError = new Error('Synthetic bind failure');
    await expect(listenOnFetchSafePort(server)).rejects.toBe(server.listenError);
    expect(server.events).toEqual(['listen:0:127.0.0.1']);
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
  });

  it('propagates synchronous HTTP listen failures and removes its error handler', async () => {
    const server = new FakeHttpServer();
    const error = new Error('Synthetic synchronous bind failure');
    vi.spyOn(server, 'listen').mockImplementation(() => {
      throw error;
    });
    await expect(listenOnFetchSafePort(server)).rejects.toBe(error);
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
    expect(server.events).toEqual([]);
  });

  it('does not relisten after an HTTP close failure', async () => {
    const server = new FakeHttpServer();
    server.closeError = new Error('Synthetic close failure');
    await expect(listenOnFetchSafePort(server)).rejects.toBe(server.closeError);
    expect(server.listens).toBe(1);
  });

  it('closes an HTTP listener that has no usable loopback address', async () => {
    const server = new FakeHttpServer();
    vi.spyOn(server, 'address').mockReturnValue('unexpected-pipe');
    await expect(listenOnFetchSafePort(server)).rejects.toThrow('did not bind a TCP port on 127.0.0.1');
    expect(server.listens).toBe(1);
    expect(server.bound).toBeNull();
  });

  it('keeps the accepted Vite server and origin bound', async () => {
    const events: string[] = [];
    const server = fakeVite(12000, events);
    const create = vi.fn(async () => server);
    expect(await createFetchSafeViteServer(create)).toEqual({ server, origin: 'http://127.0.0.1:12000' });
    expect(create).toHaveBeenCalledOnce();
    expect(events).toEqual(['listen:12000']);
    expect(server.close).not.toHaveBeenCalled();
  });

  it('finishes closing bad Vite servers before creating fresh ones', async () => {
    const events: string[] = [];
    const bad = fakeVite(6000, events);
    const good = fakeVite(12000, events);
    let release!: () => void;
    const closed = new Promise<void>((resolve) => {
      release = resolve;
    });
    let closing!: () => void;
    const closeStarted = new Promise<void>((resolve) => {
      closing = resolve;
    });
    bad.close.mockImplementation(async () => {
      events.push('closing');
      closing();
      await closed;
      events.push('closed');
    });
    const create = vi
      .fn(async () => {
        events.push('create');
        return good;
      })
      .mockImplementationOnce(async () => {
        events.push('create');
        return bad;
      });
    const pending = createFetchSafeViteServer(create);
    await closeStarted;
    expect(events).toEqual(['create', 'listen:6000', 'closing']);
    expect(create).toHaveBeenCalledOnce();
    release();
    expect(await pending).toEqual({ server: good, origin: 'http://127.0.0.1:12000' });
    expect(events).toEqual(['create', 'listen:6000', 'closing', 'closed', 'create', 'listen:12000']);
    expect(good.close).not.toHaveBeenCalled();
  });

  it('bounds Vite creation attempts and closes every rejected server', async () => {
    const events: string[] = [];
    const servers: ReturnType<typeof fakeVite>[] = [];
    const create = vi.fn(async () => {
      const server = fakeVite(6667, events);
      servers.push(server);
      return server;
    });
    await expect(createFetchSafeViteServer(create)).rejects.toThrow('after 10 Vite listen attempts');
    expect(create).toHaveBeenCalledTimes(10);
    for (const server of servers) expect(server.close).toHaveBeenCalledOnce();
  });

  it('closes Vite on listen failure without retrying unrelated errors', async () => {
    const server = fakeVite(12000, []);
    const error = new Error('Synthetic Vite startup failure');
    server.listen.mockRejectedValue(error);
    const create = vi.fn(async () => server);
    await expect(createFetchSafeViteServer(create)).rejects.toBe(error);
    expect(create).toHaveBeenCalledOnce();
    expect(server.close).toHaveBeenCalledOnce();
  });

  it('closes Vite when no HTTP address is available', async () => {
    const server = { ...fakeVite(12000, []), httpServer: null };
    await expect(createFetchSafeViteServer(async () => server)).rejects.toThrow('did not bind a TCP port');
    expect(server.close).toHaveBeenCalledOnce();
  });

  it('preserves both startup and cleanup errors', async () => {
    const server = fakeVite(12000, []);
    const startup = new Error('Synthetic startup failure');
    const cleanup = new Error('Synthetic cleanup failure');
    server.listen.mockRejectedValue(startup);
    server.close.mockRejectedValue(cleanup);
    await expect(createFetchSafeViteServer(async () => server)).rejects.toMatchObject({
      message: 'Test server startup and cleanup both failed.',
      errors: [startup, cleanup],
      cause: cleanup,
    });
  });

  it('propagates Vite factory failures without retrying them', async () => {
    const error = new Error('Synthetic factory failure');
    const create = vi.fn(async () => {
      throw error;
    });
    await expect(createFetchSafeViteServer(create)).rejects.toBe(error);
    expect(create).toHaveBeenCalledOnce();
  });

  it('does not create another Vite server after a bad-port cleanup failure', async () => {
    const server = fakeVite(6000, []);
    const error = new Error('Synthetic cleanup failure');
    server.close.mockRejectedValue(error);
    const create = vi.fn(async () => server);
    await expect(createFetchSafeViteServer(create)).rejects.toBe(error);
    expect(create).toHaveBeenCalledOnce();
  });
});
