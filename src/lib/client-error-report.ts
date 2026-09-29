import {
  CLIENT_ERROR_AREAS,
  CLIENT_ERROR_CLASSES,
  MAX_CLIENT_ERRORS,
  isBuildFingerprint,
  reportRouteTemplate,
} from './client-error-schema';
import type { ClientErrorArea, ClientErrorCount } from './client-error-schema';

export function entryBuildFingerprint(sources: readonly string[], origin: string): string | null {
  const fingerprints = new Set<string>();
  for (const source of sources) {
    let url: URL;
    try {
      url = new URL(source, origin);
    } catch {
      continue;
    }
    if (url.origin !== origin || url.username || url.password || url.search || url.hash) continue;
    const match = /^\/assets\/index-([A-Za-z0-9_-]{8,64})\.js$/.exec(url.pathname);
    if (match) fingerprints.add(`entry:${match[1]}`);
  }
  return fingerprints.size === 1 ? [...fingerprints][0]! : null;
}

export function createClientErrorReporter(options: {
  buildVersion: string;
  pathname: () => string;
  sendBeacon: (url: string, body: Blob) => boolean;
  warn: () => void;
}) {
  let total = 0;
  let batches = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;
  const counts = new Map<string, ClientErrorCount>();
  const warn = () => {
    if (!warned) {
      warned = true;
      options.warn();
    }
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!counts.size || batches >= 4) return;
    const payload = JSON.stringify({ buildVersion: options.buildVersion, counts: [...counts.values()] });
    counts.clear();
    batches++;
    try {
      if (!options.sendBeacon('/api/client-error-report', new Blob([payload], { type: 'application/json' }))) warn();
    } catch {
      // Reporting cannot interrupt boundary recovery, and failed batches are never retried.
      warn();
    }
  };
  return {
    flush,
    report(error: unknown, area: ClientErrorArea): void {
      if (!isBuildFingerprint(options.buildVersion) || total >= MAX_CLIENT_ERRORS || batches >= 4) return;
      if (!CLIENT_ERROR_AREAS.includes(area)) {
        warn();
        return;
      }
      try {
        const errorClass =
          CLIENT_ERROR_CLASSES.find((name) => error instanceof Error && error.name === name) ?? 'other';
        const route = reportRouteTemplate(options.pathname());
        const key = JSON.stringify([errorClass, area, route]);
        const prior = counts.get(key);
        if (prior) prior.count++;
        else counts.set(key, { errorClass, area, route, count: 1 });
        total++;
        timer ??= setTimeout(flush, 5_000);
      } catch {
        warn();
      }
    },
  };
}

let reporter: ReturnType<typeof createClientErrorReporter> | undefined;
let unavailable = false;
export function reportClientError(error: unknown, area: 'app' | 'route' | 'online' | 'chunk'): void {
  if (!import.meta.env.PROD || typeof window === 'undefined' || unavailable) return;
  try {
    if (!reporter) {
      const buildVersion = entryBuildFingerprint(
        Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'), (script) => script.src),
        location.origin,
      );
      if (!buildVersion || typeof navigator.sendBeacon !== 'function') {
        unavailable = true;
        return;
      }
      reporter = createClientErrorReporter({
        buildVersion,
        pathname: () => location.pathname,
        sendBeacon: (url, body) => navigator.sendBeacon(url, body),
        warn: () => console.warn('Anonymous client error counts could not be sent.'),
      });
      window.addEventListener('pagehide', reporter.flush);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') reporter?.flush();
      });
    }
    reporter.report(error, area);
  } catch {
    unavailable = true;
    console.warn('Anonymous client error reporting is unavailable.');
  }
}
