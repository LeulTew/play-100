import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CatalogEnrichmentSession, enrichmentRequestKey } from '../lib/catalog-enrichment-session';
import { afterFrame } from '../lib/after-frame';
import { useConnectionStatus } from './useConnectionStatus';

export interface PublicCatalogLookup {
  online: boolean;
  scopeKey: string;
  onEnableOnline: () => void;
}
export function useCatalogEnrichment(id: string, lookup?: PublicCatalogLookup) {
  const [session] = useState(() => new CatalogEnrichmentSession());
  const connected = useConnectionStatus();
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const allowed = Boolean(lookup);
  const online = lookup?.online ?? false;
  const scopeKey = lookup?.scopeKey ?? '';
  const key = enrichmentRequestKey({ id, allowed, online, scopeKey, connected });
  const initial = useMemo(
    () => session.peek({ id, allowed, online, scopeKey, connected }),
    [id, allowed, online, scopeKey, connected, session],
  );
  useEffect(() => {
    const cancelStart = afterFrame(() => session.start({ id, allowed, online, scopeKey, connected }));
    return () => {
      cancelStart();
      session.cancel();
    };
  }, [id, allowed, online, scopeKey, connected, session]);
  const current = snapshot.key === key ? snapshot : initial;
  return { ...current, retry: session.retry, connected };
}
