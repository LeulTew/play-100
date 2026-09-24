import type { FriendCursor, FriendIdentity, FriendPair } from './friend-types';
import { friendPageSignature, friendPeer, uniqueFriendPairs } from './friend-manager';
import type { FriendIdentityState } from './friend-manager';

interface Page<Cursor> {
  items: FriendPair[];
  cursor: Cursor | undefined;
}
export interface FriendManagerStore<Cursor> {
  listRelations(uid: string, state: 'accepted' | 'pending', cursor?: Cursor): Promise<Page<Cursor>>;
  watchRelations(
    uid: string,
    state: 'accepted' | 'pending',
    next: (page: Page<Cursor>) => void,
    error: (cause: Error) => void,
  ): () => void;
  pair(uid: string, peer: string): Promise<FriendPair | null>;
  watchPair(
    uid: string,
    peer: string,
    next: (pair: FriendPair | null) => void,
    error: (cause: Error) => void,
  ): () => void;
  identity(uid: string): Promise<FriendIdentity | null>;
  publicIdentity(uid: string): Promise<FriendIdentity | null>;
}
export interface FriendManagerSnapshot<Cursor = FriendCursor> {
  pairs: FriendPair[];
  identities: Record<string, FriendIdentityState>;
  cursor: Cursor | undefined;
  pages: number;
  ready: boolean;
  loading: boolean;
  active: boolean;
  changed: boolean;
  error: unknown | null;
}

/** Explicit pages stay stable. The head stream signals refresh; loaded pair streams revoke rows immediately. */
export class FriendManagerFeed<Cursor = FriendCursor> {
  private snapshot: FriendManagerSnapshot<Cursor> = {
    pairs: [],
    identities: {},
    cursor: undefined,
    pages: 0,
    ready: false,
    loading: true,
    active: false,
    changed: false,
    error: null,
  };
  private listeners = new Set<() => void>();
  private releaseHead: (() => void) | undefined;
  private rowWatches = new Map<string, () => void>();
  private profileLeases = new Map<string, number>();
  private profileQueue: Array<{ peer: string; lease: number; version: number }> = [];
  private reads = 0;
  private version = 0;
  private loadVersion = 0;
  private baseline = '';
  constructor(
    private store: FriendManagerStore<Cursor>,
    readonly uid: string,
    private kind: 'accepted' | 'pending',
    private isCurrent: () => boolean,
  ) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private current(version = this.version) {
    return this.snapshot.active && version === this.version && this.isCurrent();
  }
  private update(patch: Partial<FriendManagerSnapshot<Cursor>>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  start() {
    if (this.snapshot.active || !this.isCurrent()) return;
    this.update({ active: true, loading: !this.snapshot.ready, error: null });
    this.bindHead();
    this.bindRows();
  }
  stop() {
    this.version += 1;
    this.loadVersion += 1;
    this.releaseHead?.();
    this.releaseHead = undefined;
    this.rowWatches.forEach((release) => release());
    this.rowWatches.clear();
    this.profileQueue = [];
    this.profileLeases.clear();
    this.update({ active: false, loading: false });
  }
  private bindHead() {
    const version = this.version;
    this.releaseHead?.();
    this.releaseHead = this.store.watchRelations(
      this.uid,
      this.kind,
      (page) => {
        if (!this.current(version)) return;
        if (!this.snapshot.ready) {
          this.baseline = friendPageSignature(page.items);
          this.update({
            pairs: uniqueFriendPairs(page.items),
            cursor: page.cursor,
            pages: 1,
            ready: true,
            loading: false,
            error: null,
          });
          this.bindRows();
        } else if (friendPageSignature(page.items) !== this.baseline) this.update({ changed: true });
      },
      (cause) => {
        if (!this.current(version)) return;
        this.version += 1;
        this.loadVersion += 1;
        this.rowWatches.forEach((release) => release());
        this.rowWatches.clear();
        this.profileQueue = [];
        this.profileLeases.clear();
        this.update({ pairs: [], identities: {}, ready: false, loading: false, changed: true, error: cause });
      },
    );
  }
  private forget(peer: string) {
    this.profileLeases.set(peer, (this.profileLeases.get(peer) ?? 0) + 1);
    const identities = { ...this.snapshot.identities };
    delete identities[peer];
    this.rowWatches.get(peer)?.();
    this.rowWatches.delete(peer);
    this.update({ pairs: this.snapshot.pairs.filter((row) => friendPeer(row, this.uid) !== peer), identities });
  }
  private applyPair(peer: string, pair: FriendPair | null) {
    if (!pair || pair.state !== this.kind) {
      this.forget(peer);
      return;
    }
    const previous = this.snapshot.pairs.find((row) => friendPeer(row, this.uid) === peer);
    if (!previous) return;
    if (pair.epoch < previous.epoch) return;
    this.update({ pairs: this.snapshot.pairs.map((row) => (friendPeer(row, this.uid) === peer ? pair : row)) });
    const profile = this.snapshot.identities[peer];
    if (previous.from !== pair.from || !profile || (profile.status === 'loading' && !this.profileLeases.has(peer)))
      this.enqueueProfile(peer);
  }
  private bindRows() {
    const version = this.version;
    const peers = new Set(this.snapshot.pairs.map((pair) => friendPeer(pair, this.uid)));
    for (const [peer, release] of this.rowWatches)
      if (!peers.has(peer)) {
        release();
        this.rowWatches.delete(peer);
      }
    for (const peer of peers) {
      if (this.rowWatches.has(peer)) continue;
      this.rowWatches.set(
        peer,
        this.store.watchPair(
          this.uid,
          peer,
          (pair) => {
            if (this.current(version)) this.applyPair(peer, pair);
          },
          (cause) => {
            if (!this.current(version)) return;
            this.rowWatches.get(peer)?.();
            this.rowWatches.delete(peer);
            this.profileLeases.set(peer, (this.profileLeases.get(peer) ?? 0) + 1);
            const denied = cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied';
            if (denied) this.forget(peer);
            else this.update({ identities: { ...this.snapshot.identities, [peer]: { status: 'error', cause } } });
          },
        ),
      );
    }
  }
  private enqueueProfile(peer: string) {
    const lease = (this.profileLeases.get(peer) ?? 0) + 1;
    this.profileLeases.set(peer, lease);
    this.update({ identities: { ...this.snapshot.identities, [peer]: { status: 'loading' } } });
    this.profileQueue.push({ peer, lease, version: this.version });
    this.pumpProfiles();
  }
  private pumpProfiles() {
    while (this.reads < 4 && this.profileQueue.length && this.current()) {
      const job = this.profileQueue.shift()!;
      if (job.version !== this.version || this.profileLeases.get(job.peer) !== job.lease) continue;
      const pair = this.snapshot.pairs.find((row) => friendPeer(row, this.uid) === job.peer);
      if (!pair) continue;
      const publicOnly = pair.state === 'pending' && pair.from === this.uid;
      this.reads += 1;
      const valid = () =>
        this.current(job.version) &&
        this.profileLeases.get(job.peer) === job.lease &&
        this.snapshot.pairs.some((row) => friendPeer(row, this.uid) === job.peer);
      void (publicOnly ? this.store.publicIdentity(job.peer) : this.store.identity(job.peer))
        .then((value) => {
          if (!valid()) return;
          this.update({
            identities: {
              ...this.snapshot.identities,
              [job.peer]: value ? { status: 'ready', value } : { status: 'unavailable', reason: 'missing' },
            },
          });
        })
        .catch((cause) => {
          if (!valid()) return;
          const denied = cause && typeof cause === 'object' && 'code' in cause && cause.code === 'permission-denied';
          this.update({
            identities: {
              ...this.snapshot.identities,
              [job.peer]: denied ? { status: 'unavailable', reason: 'denied' } : { status: 'error', cause },
            },
          });
        })
        .finally(() => {
          this.reads -= 1;
          this.pumpProfiles();
        });
    }
  }
  async retryProfile(peer: string) {
    const version = this.version;
    if (!this.current() || !this.snapshot.pairs.some((row) => friendPeer(row, this.uid) === peer)) return;
    this.update({ identities: { ...this.snapshot.identities, [peer]: { status: 'loading' } } });
    try {
      const pair = await this.store.pair(this.uid, peer);
      if (!this.current(version)) return;
      if (!pair || pair.state !== this.kind) {
        this.forget(peer);
        return;
      }
      this.bindRows();
      this.enqueueProfile(peer);
    } catch (cause) {
      if (this.current(version))
        this.update({ identities: { ...this.snapshot.identities, [peer]: { status: 'error', cause } } });
    }
  }
  async loadMore() {
    return this.load(false);
  }
  async refresh() {
    return this.load(true);
  }
  private async load(refresh: boolean): Promise<boolean> {
    if (!this.current() || this.snapshot.loading || (!refresh && (!this.snapshot.cursor || this.snapshot.changed)))
      return false;
    const version = this.version;
    const operation = ++this.loadVersion;
    const count = refresh ? Math.max(1, this.snapshot.pages) : 1;
    this.update({ loading: true, error: null });
    const rows: FriendPair[] = [];
    let cursor = refresh ? undefined : this.snapshot.cursor;
    let pages = 0;
    let baseline = this.baseline;
    try {
      for (; pages < count; pages += 1) {
        const result = await this.store.listRelations(this.uid, this.kind, cursor);
        if (!this.current(version) || this.loadVersion !== operation) return false;
        if (refresh && pages === 0) baseline = friendPageSignature(result.items);
        rows.push(...result.items);
        cursor = result.cursor;
        if (!cursor) {
          pages += 1;
          break;
        }
      }
      if (refresh) {
        this.version += 1;
        this.rowWatches.forEach((release) => release());
        this.rowWatches.clear();
        this.profileQueue = [];
        this.profileLeases.clear();
        this.baseline = baseline;
      }
      this.update({
        pairs: uniqueFriendPairs(refresh ? rows : [...this.snapshot.pairs, ...rows]),
        identities: refresh ? {} : this.snapshot.identities,
        cursor,
        pages: refresh ? pages : this.snapshot.pages + pages,
        ready: true,
        loading: false,
        changed: refresh ? false : this.snapshot.changed,
      });
      this.bindRows();
      if (refresh) this.bindHead();
      return true;
    } catch (cause) {
      if (this.current(version) && this.loadVersion === operation) this.update({ loading: false, error: cause });
      return false;
    }
  }
}
