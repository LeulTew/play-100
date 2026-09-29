import type { Dispatch, SetStateAction } from 'react';
import type { Game } from '../lib/types';
import type { LibraryRecord } from '../lib/personal-types';
import { unrankedCellLabel } from '../lib/friend-comparison';
import type { ComparisonPage, ComparisonParticipant } from '../lib/friend-comparison';
import { recordFromPublic } from '../lib/community';
import type { FriendIdentity } from '../lib/friend-types';
import { Avatar } from '../components/avatar/Avatar';
import { onlineError } from './errors';

/** One page of the comparison, a row per game and a column per person, and the pager. */
export function FriendComparisonTable({
  uid,
  identity,
  datasets,
  identities,
  result,
  filtered,
  page,
  setPage,
  games,
  onOpen,
  setError,
}: {
  uid: string;
  identity: { displayName: string; avatar: FriendIdentity['avatar'] };
  datasets: ComparisonParticipant[];
  identities: Record<string, FriendIdentity>;
  result: ComparisonPage;
  /** Whether the comparison is limited to games chosen in the tray. */
  filtered: boolean;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  games: Game[];
  onOpen: (record: LibraryRecord) => void;
  setError: Dispatch<SetStateAction<string>>;
}) {
  return (
    <>
      <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Ranking comparison table">
        <table className="friend-matrix">
          <thead>
            <tr>
              <th scope="col">Game</th>
              {datasets.map((person) => {
                const profile = identities[person.id];
                return (
                  <th scope="col" key={person.id}>
                    <span className="compare-participant-heading">
                      {person.id === uid ? (
                        <Avatar descriptor={identity.avatar} size={32} />
                      ) : profile && person.availability === 'ready' ? (
                        <Avatar descriptor={profile.avatar} size={32} />
                      ) : null}
                      <span>
                        <bdi>{person.displayName}</bdi>
                      </span>
                    </span>
                  </th>
                );
              })}
              <th scope="col">Mean · spread</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  <button
                    className="text-button"
                    onClick={() => {
                      try {
                        onOpen(recordFromPublic({ ...row.game, score: null, position: 1 }, games));
                      } catch (cause) {
                        setError(onlineError(cause));
                      }
                    }}
                  >
                    {row.game.title}
                  </button>
                  <small>
                    {row.game.source} · {row.game.year ?? 'Year unknown'}
                  </small>
                </th>
                {row.cells.map((cell) => (
                  <td key={cell.participantId}>
                    {cell.status === 'ranked' ? (
                      <>
                        <strong>{cell.score === null ? 'Unrated' : cell.score.toFixed(1)}</strong>
                        <small>Rank {cell.position}</small>
                      </>
                    ) : (
                      <span>{unrankedCellLabel(cell.status)}</span>
                    )}
                  </td>
                ))}
                <td>
                  {row.cells.some((cell) => cell.status === 'unfetched')
                    ? 'Incomplete'
                    : row.meanScore === null
                      ? 'Unrated'
                      : row.meanScore.toFixed(2)}
                  <small>
                    {row.raterCount} {row.raterCount === 1 ? 'rater' : 'raters'} ·{' '}
                    {row.scoreSpread === null ? 'No spread' : row.scoreSpread.toFixed(2)}
                    {row.scoreDifference === null ? '' : ` · difference ${row.scoreDifference.toFixed(2)}`}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.rows.length && (
        <p>
          {filtered
            ? 'No chosen games match the available rankings and filters. Unshared rankings cannot contribute scores.'
            : 'No matching games in this view.'}
        </p>
      )}
      <div className="button-row">
        <button className="text-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
          Previous
        </button>
        <span>
          {result.totalRows ? result.page : 0} / {result.pageCount}
        </span>
        <button
          className="text-button"
          disabled={page >= result.pageCount}
          onClick={() => setPage((value) => value + 1)}
        >
          Next 25
        </button>
      </div>
    </>
  );
}
