import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useCompareTray } from '../compare-tray';
import { useDiscoveryCatalog } from '../../hooks/useDiscoveryCatalog';
import { indexDiscoveryArtwork } from '../../lib/discovery-catalog-shared';
import type { CatalogArtwork } from '../../lib/discovery-catalog';
import { EMPTY_DISCOVERY_ARTWORK, hasKnownDiscoveryArtwork } from '../../lib/discovery-artwork-presence';
import type { LibraryRecord } from '../../lib/personal-types';

export type CompareTray = ReturnType<typeof useCompareTray>;

/** The Compare tray, the discovery artwork its pins and previews need, and a public preview it can resolve. */
export function CompareTrayBindings({
  needsArtwork,
  previewId,
  resolvedRecordId,
  onResolvePreview,
  children,
}: {
  needsArtwork: boolean;
  resolvedRecordId: string | null;
  previewId: string | null;
  onResolvePreview: (record: LibraryRecord) => void;
  children: (
    tray: CompareTray,
    artwork: ReadonlyMap<string, CatalogArtwork>,
    previewLoading: boolean,
    previewModuleError: boolean,
  ) => ReactNode;
}) {
  const tray = useCompareTray();
  const publicPreview = Boolean(previewId && /^(wikidata:Q[1-9]\d*|freetogame:[1-9]\d*)$/.test(previewId));
  const trayRecord = tray.items.find((item) => item.id === previewId);
  const knownRecordId = resolvedRecordId ?? trayRecord?.id;
  const catalog = useDiscoveryCatalog(
    needsArtwork ||
      (publicPreview && !knownRecordId) ||
      Boolean(knownRecordId && hasKnownDiscoveryArtwork(knownRecordId)) ||
      tray.items.some((record) => hasKnownDiscoveryArtwork(record.id)),
  );
  const artwork = useMemo(
    () => (catalog.catalog ? indexDiscoveryArtwork(catalog.catalog) : EMPTY_DISCOVERY_ARTWORK),
    [catalog.catalog],
  );
  // Resolved identity controls loading, never replacement preview metadata.
  const record = resolvedRecordId
    ? undefined
    : (trayRecord ?? catalog.catalog?.items.find((item) => item.record.id === previewId)?.record);
  useEffect(() => {
    if (record) onResolvePreview(record);
  }, [record, onResolvePreview]);
  return children(
    tray,
    artwork,
    publicPreview && !knownRecordId && !record && (catalog.status === 'idle' || catalog.status === 'loading'),
    Boolean(publicPreview && !knownRecordId && !record && catalog.moduleError),
  );
}
