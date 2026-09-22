const USER_AGENT = 'Play100Catalog/2.0 (https://play-100-collection.vercel.app; public game metadata lookup)';
const JSON_HOSTS = ['www.wikidata.org', 'commons.wikimedia.org', 'www.freetogame.com', 'store.steampowered.com'];

export class CatalogError extends Error {
  readonly status: number;
  constructor(message: string, status = 502, readonly code = 'unavailable', readonly retryAfter = 0) {
    super(message);
    this.status = status;
  }
}

export interface PublicHttpOptions {
  maxBytes?: number;
  timeoutMs?: number;
  hosts?: readonly string[];
  contentTypes?: readonly string[];
}

export function requirePublicUrl(value: URL | string, hosts: readonly string[]): URL {
  const raw = String(value);
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new CatalogError('The public source URL is invalid.', 502, 'invalid'); }
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port || url.hash ||
    /[\s\\]/.test(raw)) throw new CatalogError('The public source URL is not allowed.', 502, 'invalid');
  return url;
}

async function cancelUpstreamBody(body: { cancel: () => Promise<void> } | null, status: number): Promise<void> {
  try { await body?.cancel(); }
  catch { console.warn('Catalog upstream response cleanup failed.', { status }); }
}

export async function publicBytes(value: URL | string, signal: AbortSignal, options: PublicHttpOptions = {}): Promise<{ bytes: Uint8Array; contentType: string }> {
  signal.throwIfAborted();
  const url = requirePublicUrl(value, options.hosts ?? JSON_HOSTS);
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new CatalogError('The public source took too long to reply. Try again later.', 504, 'timeout')), options.timeoutMs ?? 9000);
  let cancelRead: (() => void) | undefined;
  let rejectAbort: (reason: unknown) => void = () => undefined;
  const onAbort = () => { cancelRead?.(); rejectAbort(controller.signal.reason); };
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const read = async () => {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: options.contentTypes?.join(', ') ?? 'application/json' },
      signal: controller.signal, redirect: 'error', credentials: 'omit',
    });
    if (controller.signal.aborted) {
      await cancelUpstreamBody(response.body, response.status);
      throw controller.signal.reason;
    }
    if (response.status === 429) {
      await cancelUpstreamBody(response.body, response.status);
      const header = response.headers.get('retry-after');
      const seconds = header && /^\d+$/.test(header) ? Number(header) || 30 : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : 30;
      const retryAfter = Math.min(60, Math.max(1, Number.isFinite(seconds) ? seconds : 30));
      throw new CatalogError('This catalog is rate-limiting requests. Please wait a moment and try again.', 429, 'rate-limited', retryAfter);
    }
    if (!response.ok) {
      await cancelUpstreamBody(response.body, response.status);
      throw new CatalogError(`The source catalog is unavailable (${response.status}). Try again later or add a game manually.`, 503);
    }
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (options.contentTypes && !options.contentTypes.includes(contentType)) {
      await cancelUpstreamBody(response.body, response.status);
      throw new CatalogError('The public source returned an unsupported content type.', 502, 'invalid');
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await cancelUpstreamBody(response.body, response.status);
      throw new CatalogError('The source response was too large to import safely. Try a more specific search.');
    }
    if (!response.body) throw new CatalogError('The catalog returned no data.');
    const reader = response.body.getReader();
    cancelRead = () => { void cancelUpstreamBody(reader, response.status); };
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        controller.signal.throwIfAborted();
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > maxBytes) {
          await cancelUpstreamBody(reader, response.status);
          throw new CatalogError('The source response was too large to import safely. Try a more specific search.');
        }
        chunks.push(result.value);
      }
    } finally {
      cancelRead = undefined;
      reader.releaseLock();
    }
    controller.signal.throwIfAborted();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { bytes, contentType };
  };
  try { return await Promise.race([read(), aborted]); }
  catch (error) {
    if (signal.aborted) throw signal.reason;
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof CatalogError) throw error;
    throw new CatalogError('The public catalog could not be reached. Please try again later.', 503);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', forwardAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

export async function upstreamJson(value: URL | string, signal: AbortSignal, options?: PublicHttpOptions): Promise<unknown> {
  const { bytes } = await publicBytes(value, signal, options);
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new CatalogError('The source returned something other than readable catalog data.'); }
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'error' in payload &&
    payload.error && typeof payload.error === 'object' && !Array.isArray(payload.error)) {
    throw new CatalogError('Wikidata is temporarily busy or rejected the request. Please try again later.', 503);
  }
  return payload;
}
