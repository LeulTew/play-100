export type CatalogFailure = 'offline' | 'timeout' | 'rate-limited' | 'unavailable' | 'invalid';

export class CatalogRequestError extends Error {
  constructor(message: string, readonly kind: CatalogFailure, readonly retryAfter = 0) {
    super(message);
  }
}

export async function fetchCatalogJson(
  url: string,
  signal: AbortSignal,
  maxBytes: number,
  timeoutMs = 12_000,
): Promise<unknown> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new CatalogRequestError('The catalog took too long to reply. Try again.', 'timeout')), timeoutMs);
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  const read = async () => {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
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
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new CatalogRequestError('The catalog service returned an unreadable response. Please try again later.', 'invalid'); }
    if (!response.ok) {
      const error = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      const kind: CatalogFailure = error.code === 'rate-limited' || response.status === 429 ? 'rate-limited'
        : error.code === 'timeout' || response.status === 504 ? 'timeout' : 'unavailable';
      const retryAfter = Math.min(60, Math.max(0, Number(response.headers.get('retry-after')) || 0));
      throw new CatalogRequestError(typeof error.error === 'string' ? error.error.slice(0, 500) : 'The public catalog is temporarily unavailable.', kind, retryAfter);
    }
    return payload;
  };
  try { return await Promise.race([read(), aborted]); }
  catch (error: unknown) {
    if (signal.aborted) throw signal.reason;
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof CatalogRequestError) throw error;
    throw new CatalogRequestError('Offline or unable to reach the catalog. Check your connection and try again.', 'offline');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
