import { describe, expect, it, vi } from 'vitest';
import { FriendManagerFeed } from './friend-manager-feed';
import type { FriendManagerStore } from './friend-manager-feed';
import type { FriendIdentity, FriendPair } from './friend-types';

const profile = (uid: string): FriendIdentity => ({
  format: 1,
  uid,
  displayName: `Player ${uid}`,
  avatar: { version: 1, seed: 'a'.repeat(32), palette: 'lime' },
  revision: 1,
  updatedAt: 1,
});
const pair = (index: number): FriendPair => ({
  format: 1,
  a: 'owner',
  b: `peer-${String(index).padStart(3, '0')}`,
  participants: ['owner', `peer-${String(index).padStart(3, '0')}`],
  from: 'owner',
  state: 'accepted',
  epoch: 1,
  inviteSlot: null,
  createdAt: 1,
  updatedAt: 1000 - index,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(kind: 'accepted' | 'pending' = 'accepted') {
  let head: Parameters<FriendManagerStore<string>['watchRelations']>[2] = () => {};
  let headError: (cause: Error) => void = () => {};
  const rows = new Map<string, { next: (pair: FriendPair | null) => void; error: (cause: Error) => void }>();
  const releases = vi.fn();
  const store = {
    listRelations: vi.fn<FriendManagerStore<string>['listRelations']>(),
    watchRelations: vi.fn<FriendManagerStore<string>['watchRelations']>((_uid, _state, next, error) => {
      head = next;
      headError = error;
      return releases;
    }),
    pair: vi.fn<FriendManagerStore<string>['pair']>(),
    watchPair: vi.fn<FriendManagerStore<string>['watchPair']>((_uid, peer, next, error) => {
      rows.set(peer, { next, error });
      return () => {
        rows.delete(peer);
        releases();
      };
    }),
    identity: vi.fn<FriendManagerStore<string>['identity']>((uid) => Promise.resolve(profile(uid))),
    publicIdentity: vi.fn<FriendManagerStore<string>['publicIdentity']>((uid) =>
      Promise.resolve({ ...profile(uid), displayName: 'Published snapshot' }),
    ),
  };
  let authorized = true;
  const feed = new FriendManagerFeed(store, 'owner', kind, () => authorized);
  return {
    feed,
    store,
    rows,
    releases,
    revokeScope: () => {
      authorized = false;
    },
    head: (items: FriendPair[], cursor?: string) => head({ items, cursor }),
    headError: (cause: Error) => headError(cause),
  };
}

describe('stable bounded manager feed', () => {
  it('reads only the published snapshot for outgoing pending requests and the requester identity for incoming ones', async () => {
    const f = fixture('pending');
    const outgoing = { ...pair(0), state: 'pending' as const };
    const incoming = { ...pair(1), state: 'pending' as const, from: pair(1).b };
    f.feed.start();
    f.head([outgoing, incoming]);
    f.rows.get(outgoing.b)!.next(outgoing);
    f.rows.get(incoming.b)!.next(incoming);
    await vi.waitFor(() => expect(f.feed.getSnapshot().identities[outgoing.b]?.status).toBe('ready'));
    expect(f.store.publicIdentity).toHaveBeenCalledWith(outgoing.b);
    expect(f.store.identity).not.toHaveBeenCalledWith(outgoing.b);
    expect(f.store.identity).toHaveBeenCalledWith(incoming.b);
    expect(f.feed.getSnapshot().identities[outgoing.b]).toMatchObject({ value: { displayName: 'Published snapshot' } });
    f.feed.stop();
  });
  it('retains loaded pages and cursor on live head changes, deduplicates boundaries and refreshes the same page window', async () => {
    const f = fixture();
    const first = Array.from({ length: 20 }, (_, index) => pair(index));
    const second = Array.from({ length: 20 }, (_, index) => pair(index + 19));
    f.feed.start();
    f.head(first, 'first');
    f.store.listRelations.mockResolvedValueOnce({ items: second, cursor: 'second' });
    expect(await f.feed.loadMore()).toBe(true);
    expect(f.feed.getSnapshot().pairs).toHaveLength(39);
    f.head([pair(100), ...first.slice(0, 19)], 'new-head');
    expect(f.feed.getSnapshot()).toMatchObject({ cursor: 'second', pages: 2, changed: true });
    expect(f.feed.getSnapshot().pairs).toHaveLength(39);
    expect(await f.feed.loadMore()).toBe(false);
    expect(f.store.listRelations).toHaveBeenCalledTimes(1);
    f.store.listRelations
      .mockResolvedValueOnce({ items: [pair(100), ...first.slice(0, 19)], cursor: 'new-first' })
      .mockResolvedValueOnce({ items: [first[19]!, ...second.slice(1)], cursor: 'new-second' });
    expect(await f.feed.refresh()).toBe(true);
    expect(f.store.listRelations).toHaveBeenNthCalledWith(2, 'owner', 'accepted', undefined);
    expect(f.store.listRelations).toHaveBeenNthCalledWith(3, 'owner', 'accepted', 'new-first');
    expect(f.feed.getSnapshot()).toMatchObject({ pages: 2, cursor: 'new-second', changed: false });
    expect(f.feed.getSnapshot().pairs).toHaveLength(40);
    f.feed.stop();
  });
  it('removes a revoked tail row without clearing others or reviving its late profile', async () => {
    const f = fixture();
    const waiting = deferred<FriendIdentity | null>();
    const first = Array.from({ length: 20 }, (_, index) => pair(index));
    f.feed.start();
    f.head(first, 'first');
    f.store.listRelations.mockResolvedValueOnce({ items: [pair(20)], cursor: undefined });
    await f.feed.loadMore();
    f.store.identity.mockImplementation((uid) =>
      uid === pair(20).b ? waiting.promise : Promise.resolve(profile(uid)),
    );
    f.rows.get(pair(20).b)!.next(pair(20));
    f.rows.get(pair(20).b)!.next({ ...pair(20), state: 'removed', epoch: 2 });
    waiting.resolve(profile(pair(20).b));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.feed.getSnapshot().pairs).toHaveLength(20);
    expect(f.feed.getSnapshot().identities[pair(20).b]).toBeUndefined();
    expect(f.feed.getSnapshot().cursor).toBeUndefined();
    f.feed.stop();
  });
  it('bounds identity reads to four, isolates missing/denied/error profiles and retries one row', async () => {
    const f = fixture();
    const waits = Array.from({ length: 6 }, () => deferred<FriendIdentity | null>());
    f.store.identity.mockImplementation((uid) => waits[Number(uid.slice(-3))]!.promise);
    const people = waits.map((_, index) => pair(index));
    f.feed.start();
    f.head(people);
    people.forEach((row) => f.rows.get(row.b)!.next(row));
    expect(f.store.identity).toHaveBeenCalledTimes(4);
    waits[0]!.resolve(profile(people[0]!.b));
    waits[1]!.resolve(null);
    waits[2]!.reject(Object.assign(new Error('Denied'), { code: 'permission-denied' }));
    waits[3]!.reject(new Error('Temporary network fault'));
    await vi.waitFor(() => expect(f.store.identity).toHaveBeenCalledTimes(6));
    waits[4]!.resolve(profile(people[4]!.b));
    waits[5]!.resolve(profile(people[5]!.b));
    await vi.waitFor(() => expect(f.feed.getSnapshot().identities[people[5]!.b]?.status).toBe('ready'));
    expect(f.feed.getSnapshot().identities[people[1]!.b]).toEqual({ status: 'unavailable', reason: 'missing' });
    expect(f.feed.getSnapshot().identities[people[2]!.b]).toEqual({ status: 'unavailable', reason: 'denied' });
    expect(f.feed.getSnapshot().identities[people[3]!.b]?.status).toBe('error');
    expect(f.feed.getSnapshot().pairs).toHaveLength(6);
    f.store.pair.mockResolvedValue(people[3]!);
    f.store.identity.mockResolvedValue(profile(people[3]!.b));
    await f.feed.retryProfile(people[3]!.b);
    await vi.waitFor(() => expect(f.feed.getSnapshot().identities[people[3]!.b]?.status).toBe('ready'));
    expect(f.store.identity).toHaveBeenCalledTimes(7);
    f.feed.stop();
  });
  it('rejects late page/profile work after account or binding changes', async () => {
    const f = fixture();
    const profileRead = deferred<FriendIdentity | null>();
    const pageRead = deferred<{ items: FriendPair[]; cursor: string | undefined }>();
    f.feed.start();
    f.head([pair(0)], 'first');
    f.store.identity.mockReturnValue(profileRead.promise);
    f.rows.get(pair(0).b)!.next(pair(0));
    f.store.listRelations.mockReturnValue(pageRead.promise);
    const loading = f.feed.loadMore();
    f.revokeScope();
    f.feed.stop();
    profileRead.resolve(profile(pair(0).b));
    pageRead.resolve({ items: [pair(1)], cursor: undefined });
    expect(await loading).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.feed.getSnapshot().identities[pair(0).b]?.status).not.toBe('ready');
    expect(f.feed.getSnapshot().pairs).toHaveLength(1);
    expect(f.feed.getSnapshot().active).toBe(false);
    expect(f.rows.size).toBe(0);
  });
  it('does not repopulate identities after a permission failure and supports an explicit fresh read', async () => {
    const f = fixture();
    const waiting = deferred<FriendIdentity | null>();
    f.feed.start();
    f.head([pair(0)], 'first');
    f.store.identity.mockReturnValue(waiting.promise);
    f.rows.get(pair(0).b)!.next(pair(0));
    f.headError(Object.assign(new Error('Permission changed'), { code: 'permission-denied' }));
    waiting.resolve(profile(pair(0).b));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.feed.getSnapshot()).toMatchObject({ pairs: [], identities: {}, ready: false, changed: true });
    f.store.listRelations.mockResolvedValue({ items: [pair(1)], cursor: undefined });
    expect(await f.feed.refresh()).toBe(true);
    expect(f.feed.getSnapshot()).toMatchObject({ pairs: [pair(1)], ready: true, changed: false, error: null });
    f.feed.stop();
  });
  it('preserves loaded rows and exposes a failed load-more error instead of claiming completion', async () => {
    const f = fixture();
    f.feed.start();
    f.head([pair(0)], 'first');
    const error = new Error('Offline');
    f.store.listRelations.mockRejectedValue(error);
    expect(await f.feed.loadMore()).toBe(false);
    expect(f.feed.getSnapshot()).toMatchObject({ pairs: [pair(0)], cursor: 'first', loading: false, error });
    f.feed.stop();
  });
  it('reattaches a failed tail relationship stream on profile retry so later revocation still removes the row', async () => {
    const f = fixture();
    f.feed.start();
    f.head(
      Array.from({ length: 20 }, (_, index) => pair(index)),
      'first',
    );
    f.store.listRelations.mockResolvedValue({ items: [pair(20)], cursor: undefined });
    await f.feed.loadMore();
    const peer = pair(20).b;
    const failed = f.rows.get(peer)!;
    failed.next(pair(20));
    await vi.waitFor(() => expect(f.feed.getSnapshot().identities[peer]?.status).toBe('ready'));
    failed.error(new Error('Temporary stream failure'));
    expect(f.rows.has(peer)).toBe(false);
    expect(f.feed.getSnapshot().identities[peer]?.status).toBe('error');
    f.store.pair.mockResolvedValue(pair(20));
    await f.feed.retryProfile(peer);
    const recovered = f.rows.get(peer)!;
    expect(recovered).toBeDefined();
    expect(recovered).not.toBe(failed);
    await vi.waitFor(() => expect(f.feed.getSnapshot().identities[peer]?.status).toBe('ready'));
    recovered.next({ ...pair(20), state: 'removed', epoch: 2 });
    expect(f.feed.getSnapshot().pairs).toHaveLength(20);
    expect(f.feed.getSnapshot().identities[peer]).toBeUndefined();
    f.feed.stop();
  });
});
