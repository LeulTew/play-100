import type { RefObject, SyntheticEvent } from 'react';
import type { ComparisonParticipant, FriendComparison } from '../lib/friend-comparison';
import type { FriendIdentity } from '../lib/friend-types';
import type { FriendStore } from './friend-store';
import { Icon } from '../components/Icon';
import { FriendComparisonLoader } from './FriendComparisonLoader';

/**
 * Whose rankings the comparison has: an alert for any that could not be read, and the coverage details, whose list
 * loads each chosen friend's ranking.
 */
export function FriendComparisonCoverage({
  store,
  uid,
  selected,
  datasets,
  unavailable,
  comparison,
  filtered,
  exactIds,
  acceptParticipant,
  removeParticipant,
  reviewCoverage,
  coverageRef,
  coverageOpen,
  onCoverageToggle,
}: {
  store: FriendStore;
  uid: string;
  selected: string[];
  datasets: ComparisonParticipant[];
  unavailable: ComparisonParticipant[];
  comparison: FriendComparison | null;
  /** Whether the comparison is limited to games chosen in the tray. */
  filtered: boolean;
  exactIds: readonly string[] | null;
  acceptParticipant: (peer: string, person: FriendIdentity | null, participant: ComparisonParticipant) => void;
  removeParticipant: (peer: string) => void;
  reviewCoverage: () => void;
  coverageRef: RefObject<HTMLDetailsElement | null>;
  coverageOpen: boolean;
  onCoverageToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void;
}) {
  return (
    <>
      {unavailable.length > 0 && (
        <div className="compare-problems" role="alert">
          <ul>
            {unavailable.map((person) => (
              <li key={person.id}>
                <strong>
                  <bdi>{person.displayName}</bdi>:
                </strong>{' '}
                {person.availability === 'error' ? 'Rankings could not load.' : 'Rankings are unavailable.'}
              </li>
            ))}
          </ul>
          <button type="button" className="text-button" onClick={reviewCoverage}>
            Review coverage and recovery
            <Icon name="down" width="17" height="17" />
          </button>
        </div>
      )}
      <details
        ref={coverageRef}
        className="compare-coverage-disclosure"
        open={coverageOpen}
        onToggle={onCoverageToggle}
      >
        <summary>
          Coverage &amp; loading
          {comparison && (
            <span className="compare-coverage-summary" role="status">
              {filtered
                ? 'Only the chosen games are checked. Overall totals are unknown.'
                : comparison.cohort.incomplete
                  ? datasets.some((person) => person.availability === 'loading')
                    ? 'Loading chosen rankings… Overall totals are unknown.'
                    : 'Loaded games only. Overall totals are unknown.'
                  : `${comparison.summary.sharedGameCount ?? 'Unknown'} games in common.`}
            </span>
          )}
        </summary>
        <ul className="compare-freshness">
          {selected
            .filter((value) => value !== uid)
            .map((peer) => (
              <FriendComparisonLoader
                key={`${uid}:${peer}`}
                store={store}
                uid={uid}
                peer={peer}
                exactIds={exactIds}
                onData={acceptParticipant}
                onRemove={removeParticipant}
              />
            ))}
        </ul>
        {comparison && !filtered && (
          <p className="section-help">
            {comparison.summary.sharedGameCount ?? 'Unknown'} games in common.
            {comparison.summary.pairs.length === 1 && comparison.summary.pairs[0]?.meanAbsoluteScoreGap != null
              ? ` Mean score gap ${comparison.summary.pairs[0].meanAbsoluteScoreGap.toFixed(2)} across ${comparison.summary.pairs[0].jointlyRatedCount} jointly rated games.`
              : ''}
          </p>
        )}
      </details>
    </>
  );
}
