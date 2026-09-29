import type { Dispatch, SetStateAction } from 'react';
import type { ComparisonMode } from '../lib/friend-comparison';
import type { LibraryRecord } from '../lib/personal-types';
import type { useComparisonGameFilter } from '../hooks/useComparisonGameFilter';

/** Which games are compared: those everyone ranked or all available, the search, and any games chosen in the tray. */
export function FriendComparisonFilters({
  viewReady,
  mode,
  setMode,
  query,
  setQuery,
  setPage,
  filteredGames,
  onOpen,
}: {
  viewReady: boolean;
  mode: ComparisonMode;
  setMode: Dispatch<SetStateAction<ComparisonMode>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  filteredGames: ReturnType<typeof useComparisonGameFilter>;
  onOpen: (record: LibraryRecord) => void;
}) {
  return (
    <>
      <div className="compare-toolbar">
        <label>
          Games
          <select
            aria-label="Games"
            value={mode}
            disabled={!viewReady}
            onChange={(event) => {
              setMode(event.target.value === 'all-shared' ? 'all-shared' : 'common-ranked');
              setPage(1);
            }}
          >
            <option value="common-ranked">Ranked by everyone</option>
            <option value="all-shared">All available games</option>
          </select>
        </label>
        <label>
          Search games
          <input
            type="search"
            maxLength={160}
            value={query}
            disabled={!viewReady}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {filteredGames.value && (
        <section className="compare-game-filter" aria-label="Games chosen for comparison">
          <div className="button-row">
            <strong>
              {filteredGames.value.records.length} {filteredGames.value.records.length === 1 ? 'game' : 'games'} from
              your tray
            </strong>
            <button
              className="text-button"
              disabled={!viewReady}
              onClick={() => {
                filteredGames.clear();
                setPage(1);
              }}
            >
              Clear game filter
            </button>
          </div>
          <ul>
            {filteredGames.value.records.map((record) => (
              <li key={record.id}>
                <button className="text-button" onClick={() => onOpen(record)}>
                  {record.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
