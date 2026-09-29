import { abortReason, throwIfAborted } from './abort';

export type CatalogFailure = 'offline' | 'timeout' | 'rate-limited' | 'unavailable' | 'invalid';

export class CatalogRequestError extends Error {
  constructor(
    message: string,
    readonly kind: CatalogFailure,
    readonly retryAfter = 0,
  ) {
    super(message);
  }
}

export async function fetchCatalogJson(
  url: string,
  signal: AbortSignal,
  maxBytes: number,
  timeoutMs = 12_000,
): Promise<unknown> {
  throwIfAborted(signal);
  const controller = new AbortController();
  // Older controllers discard abort(reason), so retain the transport's own cause.
  let abortCause: unknown;
  const cancel = () => {
    abortCause = abortReason(signal);
    controller.abort(abortCause);
  };
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => {
    abortCause = new CatalogRequestError('The catalog took too long to reply. Try again.', 'timeout');
    controller.abort(abortCause);
  }, timeoutMs);
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortCause);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  const read = async () => {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const httpFailure = response.ok
      ? null
      : new CatalogRequestError(
          'The public catalog is temporarily unavailable.',
          response.status === 429 ? 'rate-limited' : response.status === 504 ? 'timeout' : 'unavailable',
          Math.min(60, Math.max(0, Number(response.headers.get('retry-after')) || 0)),
        );
    try {
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw new CatalogRequestError('The catalog response is too large. Try a narrower search.', 'invalid');
      }
      if (!response.body) throw new CatalogRequestError('The catalog returned no readable data.', 'invalid');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new CatalogRequestError('The catalog response is too large. Try a narrower search.', 'invalid');
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new CatalogRequestError(
          'The catalog service returned an unreadable response. Please try again later.',
          'invalid',
        );
      }
      if (httpFailure) {
        const error = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
        const kind =
          httpFailure.kind !== 'unavailable'
            ? httpFailure.kind
            : error.code === 'rate-limited' || error.code === 'timeout'
              ? error.code
              : 'unavailable';
        throw new CatalogRequestError(
          typeof error.error === 'string' ? error.error.slice(0, 500) : httpFailure.message,
          kind,
          httpFailure.retryAfter,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof CatalogRequestError && error.kind !== 'invalid') throw error;
      throw httpFailure ?? error;
    }
  };
  try {
    return await Promise.race([read(), aborted]);
  } catch (error: unknown) {
    throwIfAborted(signal);
    if (controller.signal.aborted) throw abortCause;
    if (error instanceof CatalogRequestError) throw error;
    throw new CatalogRequestError(
      'Offline or unable to reach the catalog. Check your connection and try again.',
      'offline',
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
