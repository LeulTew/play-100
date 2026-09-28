import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PreparedPreview } from '../AppMotionBindings';
import {
  canonicalCatalogId,
  catalogActionRecord,
  catalogOwnership,
  collectionGameForId,
  resolveCatalogRecord,
} from '../lib/catalog-identity';
import type { LibraryRecord, PersonalAction } from '../lib/personal-types';
import { recordFromGame } from '../lib/personal-types';
import type { PreviewAuthority } from '../lib/preview-authority';
import type { AppPage, Game } from '../lib/types';

export interface PreviewedRecord {
  record: LibraryRecord;
  authority?: PreviewAuthority;
}

const noPreviewSubscription = () => () => {};

/**
 * The game or catalog record the URL's detail names: a collection game, a saved record, or a preview remembered for
 * this library scope. A shared preview whose authority stops permitting it is forgotten, and closes unless the
 * library knows the record.
 */
export function useDetailSelection({
  selectedSlug,
  page,
  libraryScope,
  games,
  collectionReady,
  records,
  canonicalRecords,
  closeGame,
  notify,
  clearNotice,
  perform,
}: {
  selectedSlug: string | null;
  page: AppPage;
  libraryScope: string;
  games: Game[] | undefined;
  collectionReady: boolean;
  records: Record<string, LibraryRecord>;
  canonicalRecords: LibraryRecord[];
  closeGame: () => void;
  notify: (message: string) => void;
  clearNotice: () => void;
  perform: (action: PersonalAction) => Promise<boolean>;
}) {
  const [previewedRecords, setPreviewedRecords] = useState<{ scope: string; records: Map<string, PreviewedRecord> }>({
    scope: 'guest',
    records: new Map(),
  });
  const allRecords = useMemo(
    () => new Map([...Object.values(records), ...canonicalRecords].map((record) => [record.id, record])),
    [records, canonicalRecords],
  );
  const ownership = useMemo(() => catalogOwnership(records), [records]);
  const transientPreview =
    selectedSlug && previewedRecords.scope === libraryScope ? previewedRecords.records.get(selectedSlug) : undefined;
  const publicCatalogAlias = Boolean(
    selectedSlug && ['collection', 'discover'].includes(page) && !records[selectedSlug] && !transientPreview?.authority,
  );
  const selectedGame =
    games?.find((game) => game.slug === selectedSlug) ??
    (selectedSlug && publicCatalogAlias ? collectionGameForId(games ?? [], selectedSlug) : undefined);
  const previewPermitted = useSyncExternalStore(
    transientPreview?.authority?.subscribe ?? noPreviewSubscription,
    () =>
      !transientPreview?.authority ||
      (transientPreview.authority.scope === libraryScope &&
        transientPreview.authority.permits(transientPreview.record.id)),
    () => false,
  );
  // A revoked preview is forgotten as soon as a render sees it; the commit then closes it.
  const [revokedPreview, setRevokedPreview] = useState<PreviewedRecord | null>(null);
  if (transientPreview?.authority && !previewPermitted) {
    const next = new Map(previewedRecords.records);
    next.delete(transientPreview.record.id);
    setPreviewedRecords({ ...previewedRecords, records: next });
    setRevokedPreview(transientPreview);
  }
  const closedPreview = useRef<PreviewedRecord | null>(null);
  useEffect(() => {
    if (!revokedPreview || closedPreview.current === revokedPreview) return;
    closedPreview.current = revokedPreview;
    if (!allRecords.has(revokedPreview.record.id)) {
      closeGame();
      notify('This shared game is no longer available.');
    }
  }, [revokedPreview, allRecords, closeGame, notify]);
  const awaitingCanonicalPreview = Boolean(
    publicCatalogAlias && selectedSlug && canonicalCatalogId(selectedSlug) !== selectedSlug && !collectionReady,
  );
  const selectedRecord = selectedGame
    ? recordFromGame(selectedGame)
    : !awaitingCanonicalPreview && selectedSlug
      ? (allRecords.get(selectedSlug) ?? (previewPermitted ? transientPreview?.record : undefined))
      : undefined;
  const selectedPersonalRecord =
    selectedGame && selectedRecord ? catalogActionRecord(selectedRecord, ownership) : selectedRecord;

  const rememberPreview = useCallback(
    (record: LibraryRecord, authority?: PreviewAuthority) => {
      setPreviewedRecords((previous) => {
        const known = previous.records.get(record.id);
        if (previous.scope === libraryScope && known?.record === record && known.authority === authority)
          return previous;
        const next = new Map([
          ...(previous.scope === libraryScope ? previous.records : new Map()),
          [record.id, { record, authority }],
        ]);
        if (next.size > 64) {
          const oldest = next.keys().next().value;
          if (oldest !== undefined) next.delete(oldest);
        }
        return { scope: libraryScope, records: next };
      });
    },
    [libraryScope],
  );
  const preparePreview = (record: LibraryRecord, authority?: PreviewAuthority): PreparedPreview | null => {
    if (authority && (authority.scope !== libraryScope || !authority.permits(record.id))) {
      notify('This shared game is no longer available.');
      return null;
    }
    const resolved = !authority && !records[record.id] ? resolveCatalogRecord(record, games ?? []) : record;
    rememberPreview(resolved, authority);
    const publicAlias = !authority && !records[resolved.id] && ['collection', 'discover'].includes(page);
    const displayed =
      games?.find((game) => game.slug === resolved.id) ??
      (publicAlias ? collectionGameForId(games ?? [], resolved.id) : undefined);
    return { requestedDetailKey: resolved.id, displayedDetailKey: displayed?.slug ?? resolved.id };
  };
  const performDetailAction = (action: PersonalAction) => {
    clearNotice();
    if (
      transientPreview?.authority &&
      !allRecords.has(transientPreview.record.id) &&
      !transientPreview.authority.permits(transientPreview.record.id)
    ) {
      notify('The shared game is no longer available. No library change was saved.');
      return Promise.resolve(false);
    }
    return perform(action);
  };
  return {
    allRecords,
    ownership,
    transientPreview,
    selectedGame,
    selectedRecord,
    selectedPersonalRecord,
    awaitingCanonicalPreview,
    rememberPreview,
    preparePreview,
    performDetailAction,
  };
}
