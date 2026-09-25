import type { CatalogArtwork } from '../lib/discovery-catalog';
import { recordFromFriendShelf } from '../lib/friend-shelf-types';
import { GameArtwork } from '../components/games/GameArtwork';
import { FriendShelfEditor } from './FriendShelf';
import type { FriendShelfEditorProps } from './FriendShelf';
import { ShelfArtworkCredits } from './ShelfArtworkCredits';

export function FriendShelfPage({
  editor,
  artwork,
  onAccount,
}: {
  editor: Omit<FriendShelfEditorProps, 'renderArtwork'>;
  artwork?: ReadonlyMap<string, CatalogArtwork>;
  onAccount: () => void;
}) {
  return (
    <section className="app-page shared-games-page">
      <div className="page-heading">
        <h1 data-page-heading tabIndex={-1}>
          Shared games
        </h1>
        <button className="text-button" onClick={onAccount}>
          Account
        </button>
      </div>
      <FriendShelfEditor
        {...editor}
        renderArtwork={(entry) => (
          <GameArtwork record={recordFromFriendShelf(entry, editor.games)} artwork={artwork?.get(entry.id)} />
        )}
      />
      <ShelfArtworkCredits records={Object.values(editor.state.records)} artwork={artwork} />
    </section>
  );
}
