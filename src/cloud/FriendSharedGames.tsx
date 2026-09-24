import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { Game } from '../lib/types';
import type { LibraryController } from '../lib/library-controller';
import type { CatalogArtwork } from '../lib/discovery-catalog';
import type { LibraryRecord } from '../lib/personal-types';
import { recordFromFriendShelf } from '../lib/friend-shelf-types';
import type { FriendShelfStore } from './friend-shelf-store';
import type { FriendStore } from './friend-store';
import { useFriendSharedView } from './useFriendSharedView';
import { FriendShelfCards } from './FriendShelf';
import { GameArtwork, GameArtworkCredit } from '../components/games/GameArtwork';
import { cloudAuth } from './firebase-client';
import { accountScope } from '../lib/cloud-types';
import { createShelfPreviewAuthority } from '../lib/preview-authority';
import type { PreviewAuthority } from '../lib/preview-authority';

export function ShelfArtworkCredits({ records, artwork }: { records: readonly Pick<LibraryRecord, 'id' | 'title'>[]; artwork?: ReadonlyMap<string, CatalogArtwork> }) {
  const seen = new Set<string>();
  const credits = records.flatMap((record) => {
    const image = artwork?.get(record.id);
    if (!image || seen.has(image.src)) return [];
    seen.add(image.src);
    return [{ record, image }];
  });
  if (!credits.length) return null;
  return <details className="shelf-artwork-credits"><summary>Artwork credits</summary><ul>{credits.map(({ record, image }) =>
    <li key={image.src}><strong>{record.title}</strong><GameArtworkCredit artwork={image} /></li>)}</ul></details>;
}

export function FriendSharedGames({ uid, peer, authGeneration, verified, store, friends, games, library, onOpen, onPin, artwork }: {
  uid: string; peer: string; authGeneration: number; verified: boolean;
  store: FriendShelfStore; friends: FriendStore; games: Game[]; library: LibraryController;
  onOpen: (record: LibraryRecord, authority?: PreviewAuthority) => void; onPin?: (record: LibraryRecord) => boolean;
  artwork?: ReadonlyMap<string, CatalogArtwork>;
}) {
  const view = useFriendSharedView(friends, store, uid, peer, 'games', verified && games.length > 0, null, authGeneration);
  const preview = useMemo(() => createShelfPreviewAuthority(accountScope(uid, store.db.app.options.projectId), peer, authGeneration), [uid, peer, store, authGeneration]);
  useLayoutEffect(() => { preview.update(view.status === 'ready' ? view.entries.map((entry) => entry.id) : []); }, [preview, view.entries, view.status]);
  useLayoutEffect(() => () => preview.update([]), [preview]);
  const live = useRef(true);
  const latest = useRef(view); latest.current = view;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const currentRecord = (id: string) => {
    const entry = latest.current.entries.find((entry) => entry.id === id);
    if (!live.current || cloudAuth.currentUser?.uid !== uid || latest.current.status !== 'ready' || !entry) {
      throw new Error('This shared game is no longer available. Refresh the shelf.');
    }
    return recordFromFriendShelf(entry, games);
  };
  return <>
    <FriendShelfCards entries={view.entries} status={view.status} error={view.error} paged={view.mode === 'all'} total={view.total}
      savedIds={new Set(Object.keys(library.state.records))}
      onSave={async (entry) => {
        const record = currentRecord(entry.id);
        if (!await library.perform({ type: 'add-records', records: [record] })) throw new Error('This game could not be saved. Your existing library is unchanged.');
      }}
      onPin={(entry) => { if (!onPin?.(currentRecord(entry.id))) throw new Error('This game was not pinned. Check the Compare tray limit or account status.'); }}
      onOpen={(entry) => onOpen(currentRecord(entry.id), preview.authority)}
      renderArtwork={(entry) => <GameArtwork record={recordFromFriendShelf(entry, games)} artwork={artwork?.get(entry.id)} />} />
    {view.status === 'unavailable' && <button className="text-button" onClick={view.retry}>Refresh shared games</button>}
    {view.status === 'ready' && <ShelfArtworkCredits records={view.entries} artwork={artwork} />}
    {view.status === 'ready' && <p className="section-help">{view.entries.length} loaded / {view.total} shared games{view.complete ? '' : ' · more available'}</p>}
    {view.status === 'ready' && !view.complete && <button className="text-button" disabled={view.loadingMore} onClick={() => { void view.loadMore(); }}>{view.loadingMore ? 'Loading games…' : 'Load next 25 shared games'}</button>}
  </>;
}
