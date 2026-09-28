import type { IncomingMessage, ServerResponse } from 'node:http';
import { freshNonces, helperNonce } from '../src/lib/auth-helper-nonce.js';
import { nullableObject } from '../src/lib/guards.js';
import { createAdmission } from './_lib/admission.js';
import { upstreamJson } from './_lib/public-http.js';

const ORIGIN = 'https://play-100-collection.vercel.app';
const CACHE_MS = 15 * 60_000;
interface Health {
  auth: boolean;
  wikidata: boolean;
  freetogame: boolean;
}

export async function probeProduction(): Promise<Health> {
  const auth = async () => {
    const nonces: Array<string | null> = [];
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${ORIGIN}/__/auth/handler`, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
      try {
        nonces.push(response.status === 200 ? helperNonce(response.headers) : null);
      } finally {
        await response.body?.cancel();
      }
    }
    return freshNonces(nonces);
  };
  const wikidata = async () => {
    const body = nullableObject(
      await upstreamJson(
        'https://www.wikidata.org/w/api.php?action=query&meta=siteinfo&siprop=general&format=json',
        AbortSignal.timeout(5_000),
        { maxBytes: 32 * 1024, timeoutMs: 5_000, contentTypes: ['application/json'] },
      ),
    );
    return Boolean(nullableObject(nullableObject(body?.query)?.general));
  };
  const freetogame = async () => {
    const body = nullableObject(
      await upstreamJson('https://www.freetogame.com/api/game?id=1', AbortSignal.timeout(5_000), {
        maxBytes: 64 * 1024,
        timeoutMs: 5_000,
        contentTypes: ['application/json'],
      }),
    );
    return body?.id === 1 && typeof body.title === 'string';
  };
  const results = await Promise.allSettled([auth(), wikidata(), freetogame()]);
  const ok = (index: number) => results[index]?.status === 'fulfilled' && results[index].value === true;
  return { auth: ok(0), wikidata: ok(1), freetogame: ok(2) };
}

export function createOperationalProbe(
  probe: () => Promise<Health> = probeProduction,
  now: () => number = Date.now,
  log: (line: string) => void = console.log,
) {
  const admission = createAdmission({ maxActive: 4, maxPerWindow: 12, windowMs: 60_000 }, now);
  let cached: { until: number; result: Health } | undefined;
  let pending: Promise<Health> | undefined;
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' || request.url?.includes('?')) {
      response.setHeader('Allow', 'GET');
      response.writeHead(request.method !== 'GET' ? 405 : 400).end();
      return;
    }
    const release = admission.acquire();
    if (!release) {
      response.setHeader('Retry-After', '60');
      response.writeHead(429).end();
      return;
    }
    try {
      if (!cached || cached.until <= now()) {
        pending ??= Promise.resolve()
          .then(probe)
          .catch(() => ({ auth: false, wikidata: false, freetogame: false }))
          .then((result) => {
            cached = { until: now() + CACHE_MS, result };
            log(
              JSON.stringify({
                event: 'operational-probe',
                status: Object.values(result).every(Boolean) ? 'OK' : 'FAIL',
                ...result,
              }),
            );
            return result;
          })
          .finally(() => {
            pending = undefined;
          });
        await pending;
      }
      const result = cached!.result;
      response.setHeader('Content-Type', 'application/json');
      response.writeHead(Object.values(result).every(Boolean) ? 200 : 503).end(JSON.stringify(result));
    } finally {
      release();
    }
  };
}

export default createOperationalProbe();
