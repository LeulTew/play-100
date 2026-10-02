import { memo, useCallback, useMemo } from 'react';
import type { Filters, Game } from '../lib/types';
import type { LibraryRecord, PersonalProgress } from '../lib/personal-types';
import { recordFromGame } from '../lib/personal-types';
import { catalogActionRecord } from '../lib/catalog-identity';
import type { CatalogOwnership } from '../lib/catalog-identity';
import type { MotionOriginHint } from '../motion';
import { GameCard } from './GameCard';
import { SavedCatalogCopies } from './catalog/SavedCatalogCopies';
import { ComparePinButton } from './compare-tray/ComparePinButton';

type ProgressKey = 'later' | 'completed' | 'played';

interface CollectionCardProps {
  game: Game;
  filters: Filters;
  state: PersonalProgress | undefined;
  ownership: CatalogOwnership;
  pinnable: boolean;
  onOpen: (id: string, origin?: MotionOriginHint, opener?: HTMLElement) => void;
  onToggle: (id: string, key: ProgressKey, value?: boolean) => void;
  onPreview: (record: LibraryRecord, origin?: MotionOriginHint, opener?: HTMLElement) => void;
  eager: boolean;
  selecting: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  busy: boolean;
}

/** One grid or list card. Memoised with stable element props, so a page render repaints only the cards it changes. */
export const CollectionCard = memo(function CollectionCard({
  game,
  filters,
  state,
  ownership,
  pinnable,
  onOpen,
  onToggle,
  onPreview,
  eager,
  selecting,
  selected,
  onSelect,
  busy,
}: CollectionCardProps) {
  const actionRecord = useMemo(() => catalogActionRecord(recordFromGame(game), ownership), [game, ownership]);
  const copies = ownership.get(game.slug);
  const onSave = useCallback((id: string) => onToggle(id, 'later'), [onToggle]);
  const onPlayed = useCallback((id: string, value: boolean) => onToggle(id, 'played', value), [onToggle]);
  const onCompleted = useCallback((id: string, value: boolean) => onToggle(id, 'completed', value), [onToggle]);
  const savedCopies = useMemo(
    () => <SavedCatalogCopies canonicalId={game.slug} copies={copies} onOpen={onPreview} />,
    [game.slug, copies, onPreview],
  );
  const compareActions = useMemo(
    () => pinnable && <ComparePinButton record={actionRecord} compact disabled={busy} />,
    [pinnable, actionRecord, busy],
  );
  return (
    <GameCard
      game={game}
      filters={filters}
      state={state}
      onOpen={onOpen}
      onSave={onSave}
      onPlayed={onPlayed}
      onCompleted={onCompleted}
      eager={eager}
      selecting={selecting}
      selected={selected}
      onSelect={onSelect}
      busy={busy}
      compareRecord={pinnable ? actionRecord : undefined}
      savedCopies={savedCopies}
      compareActions={compareActions}
    />
  );
});
