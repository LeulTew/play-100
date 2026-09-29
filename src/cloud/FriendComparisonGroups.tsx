import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { FriendCursor, FriendGroup } from '../lib/friend-types';
import type { FriendStore } from './friend-store';
import { Icon } from '../components/Icon';

/** The account's private groups: save the chosen people as a group, start a new one, delete one or open another. */
export function FriendComparisonGroups({
  store,
  uid,
  selected,
  viewReady,
  busy,
  run,
  setMessage,
  group,
  setGroup,
  groupName,
  setGroupName,
  groups,
  setGroups,
  groupCursor,
  setGroupCursor,
  refreshGroupId,
  setRefreshGroupId,
  groupCreationIdRef,
  chooseGroup,
  routeGroup,
}: {
  store: FriendStore;
  uid: string;
  selected: string[];
  viewReady: boolean;
  busy: boolean;
  run: (operation: () => Promise<void>) => Promise<void>;
  setMessage: Dispatch<SetStateAction<string>>;
  group: FriendGroup | null;
  setGroup: Dispatch<SetStateAction<FriendGroup | null>>;
  groupName: string;
  setGroupName: Dispatch<SetStateAction<string>>;
  groups: FriendGroup[];
  setGroups: Dispatch<SetStateAction<FriendGroup[]>>;
  groupCursor: FriendCursor | undefined;
  setGroupCursor: Dispatch<SetStateAction<FriendCursor | undefined>>;
  refreshGroupId: string | null;
  setRefreshGroupId: Dispatch<SetStateAction<string | null>>;
  /** The id a new group's first save chose, which a retry of that save reuses. */
  groupCreationIdRef: RefObject<string | null>;
  chooseGroup: (value: FriendGroup) => void;
  routeGroup: (id: string | null) => void;
}) {
  return (
    <section className="account-section">
      <h2>Private groups</h2>
      <form
        data-unsaved={groupName !== (group?.name ?? '') ? 'true' : 'false'}
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const id = group?.id ?? groupCreationIdRef.current ?? crypto.randomUUID();
            if (!group) groupCreationIdRef.current = id;
            const saved = await store.saveGroup(
              uid,
              { id, name: groupName, participantUids: selected },
              group?.revision ?? 0,
            );
            groupCreationIdRef.current = null;
            chooseGroup(saved);
            setGroups((old) => [saved, ...old.filter((item) => item.id !== saved.id)]);
            setMessage('Group saved.');
          });
        }}
      >
        <label>
          Group name
          <input
            required
            maxLength={80}
            value={groupName}
            disabled={!viewReady}
            onChange={(event) => setGroupName(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button
            className="button button-outline"
            disabled={!viewReady || busy || Boolean(refreshGroupId) || selected.length < 2 || selected.length > 6}
          >
            Save group
          </button>
          {group && (
            <button
              type="button"
              className="text-button"
              disabled={Boolean(refreshGroupId)}
              onClick={() => {
                setGroup(null);
                setGroupName('');
                groupCreationIdRef.current = null;
                routeGroup(null);
              }}
            >
              New group
            </button>
          )}
          {group && (
            <button
              type="button"
              className="text-button danger-text"
              disabled={busy || Boolean(refreshGroupId)}
              onClick={() => {
                void run(async () => {
                  await store.deleteGroup(uid, group.id, group.revision);
                  setGroups((old) => old.filter((item) => item.id !== group.id));
                  setGroup(null);
                  setGroupName('');
                  routeGroup(null);
                  setMessage('Group deleted.');
                });
              }}
            >
              Delete group
            </button>
          )}
        </div>
      </form>
      {refreshGroupId && (
        <button
          className="button button-outline"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              const saved = refreshGroupId === 'pending' ? null : await store.getGroup(uid, refreshGroupId);
              const listed = await store.listGroups(uid);
              setGroups(listed.items);
              setGroupCursor(listed.cursor);
              if (saved) {
                chooseGroup(saved);
                groupCreationIdRef.current = null;
              }
              setRefreshGroupId(null);
              setMessage('Groups refreshed.');
            });
          }}
        >
          Refresh groups
        </button>
      )}
      <ul className="friend-groups">
        {groups.map((item) => (
          <li key={item.id}>
            <button className="text-button" onClick={() => chooseGroup(item)}>
              {item.name}
              <Icon name="arrow" />
            </button>
          </li>
        ))}
      </ul>
      {groupCursor && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              const more = await store.listGroups(uid, groupCursor);
              setGroups((old) => [...old, ...more.items]);
              setGroupCursor(more.cursor);
            });
          }}
        >
          More groups
        </button>
      )}
    </section>
  );
}
