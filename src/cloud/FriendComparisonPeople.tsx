import type { Dispatch, RefObject, SetStateAction, SyntheticEvent } from 'react';
import type { ComparisonParticipant } from '../lib/friend-comparison';
import type { FriendCursor, FriendIdentity, FriendPair } from '../lib/friend-types';
import { friendPeer as peerOf } from '../lib/friend-manager';
import { Avatar } from '../components/avatar/Avatar';

/** Who is compared: the chosen people and the "Change people" chooser, both of which wait while a group opens. */
export function FriendComparisonPeople({
  uid,
  identity,
  viewReady,
  selected,
  setSelected,
  setPage,
  datasets,
  choices,
  identities,
  cursor,
  busy,
  run,
  addChoices,
  peopleRef,
  peopleOpen,
  onPeopleToggle,
}: {
  uid: string;
  identity: { displayName: string; avatar: FriendIdentity['avatar'] };
  viewReady: boolean;
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  setPage: Dispatch<SetStateAction<number>>;
  datasets: ComparisonParticipant[];
  choices: FriendPair[];
  identities: Record<string, FriendIdentity>;
  cursor: FriendCursor | undefined;
  busy: boolean;
  run: (operation: () => Promise<void>) => Promise<void>;
  addChoices: (next?: FriendCursor) => Promise<void>;
  peopleRef: RefObject<HTMLDetailsElement | null>;
  peopleOpen: boolean;
  onPeopleToggle: (event: SyntheticEvent<HTMLDetailsElement>) => void;
}) {
  return (
    <>
      {viewReady ? (
        <section className="compare-chosen-people" aria-label="Chosen people">
          <p>
            <strong>
              {selected.length} {selected.length === 1 ? 'person' : 'people'}:
            </strong>{' '}
            {datasets.map((person, index) => (
              <span key={person.id}>
                {index > 0 && ', '}
                {person.id === uid ? `You (${identity.displayName})` : <bdi>{person.displayName}</bdi>}
              </span>
            ))}
          </p>
        </section>
      ) : (
        <p className="compare-opening" role="status">
          Opening comparison group…
        </p>
      )}
      <details ref={peopleRef} className="compare-people-disclosure" open={peopleOpen} onToggle={onPeopleToggle}>
        <summary>Change people</summary>
        {!viewReady ? (
          <p>Wait for this group to finish opening before changing people.</p>
        ) : (
          <>
            <fieldset className="compare-people">
              <legend>Choose 2–6 people</legend>
              {[
                uid,
                ...new Set([...choices.map((pair) => peerOf(pair, uid)), ...selected.filter((value) => value !== uid)]),
              ].map((id) => (
                <label className="check-control" key={id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(id)}
                    disabled={!selected.includes(id) && selected.length === 6}
                    onChange={(event) => {
                      setPage(1);
                      setSelected((old) => (event.target.checked ? [...old, id] : old.filter((value) => value !== id)));
                    }}
                  />
                  {id === uid ? (
                    <Avatar descriptor={identity.avatar} size={32} />
                  ) : identities[id] ? (
                    <Avatar descriptor={identities[id].avatar} size={32} />
                  ) : null}
                  <span>
                    {id === uid ? (
                      'You (private device copy)'
                    ) : (
                      <bdi>{identities[id]?.displayName ?? 'Unavailable player'}</bdi>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
            {cursor && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  void run(() => addChoices(cursor));
                }}
              >
                More friends
              </button>
            )}
          </>
        )}
      </details>
    </>
  );
}
