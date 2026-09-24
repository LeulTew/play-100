import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import type { SyncHead } from './cloud-types';
import type { Member } from './community';
import {
  closePersonalLibrary,
  commitPersonalAction,
  loadPersonalLibrary,
  readOnlineLoadHint,
  saveOnlineLoadHint,
} from './personal-db';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';
import type { LibraryRecord } from './personal-types';
import {
  commitScopedAction,
  connectScopedLibrary,
  loadScopedLibrary,
  pauseScopedLibrary,
  restoreConsentedAccount,
  restoreScopedLibrary,
} from './scoped-library';

const scope = accountScope('continuity-user');
const game: LibraryRecord = {
  id: 'example-game',
  title: 'Example game',
  source: 'collection',
  sourceId: 'example-game',
  year: 2020,
  genre: null,
  studio: null,
  sourceUrl: null,
  collectionRank: 1,
};
const head: SyncHead = {
  format: 1,
  epoch: 3,
  revision: 8,
  enabled: true,
  deleted: false,
  current: {
    format: 1,
    generation: '11111111-1111-4111-8111-111111111111',
    digest: 'a'.repeat(64),
    bytes: 1,
    chunks: ['a'.repeat(64)],
  },
  previous: null,
  updatedAt: 1,
};
const member: Member = {
  uid: 'continuity-user',
  displayName: 'Synthetic player',
  avatar: { version: 1, seed: 'a'.repeat(32), palette: 'moss' },
  consentVersion: 1,
  gameCount: 1,
  rankCount: 1,
  createdAt: 1,
  updatedAt: 1,
};
const incoming = () => applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: game, score: 8.7 });

beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => undefined });
  vi.stubGlobal('window', undefined);
});
afterEach(() => {
  closePersonalLibrary();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('own account restoration without another consent or guest upload', () => {
  it('restores an active prior-consented cloud copy into an empty cache and preserves guest and device motion', async () => {
    await loadPersonalLibrary([game]);
    const guest = await commitPersonalAction({ type: 'rate-game', record: game, score: 4 });
    await loadScopedLibrary(scope, 'lite');
    const restored = await restoreConsentedAccount(scope, incoming(), head, member, () => true);
    expect(restored.state.ranking[0]?.score).toBe(8.7);
    expect(restored.state.motion).toBe('lite');
    expect(restored.sync).toMatchObject({
      enabled: true,
      epoch: 3,
      baseRemoteRevision: 8,
      dirty: false,
      dataRevision: 1,
    });
    expect(restored.recovery).toBeNull();
    expect(restored.profile).toEqual({ displayName: member.displayName, avatar: member.avatar });
    expect((await loadPersonalLibrary([game])).state).toEqual(guest);
    closePersonalLibrary();
    expect(await loadScopedLibrary(scope)).toEqual(restored);
  });
  it.each([
    { ...head, enabled: false },
    { ...head, deleted: true },
    { ...head, current: null },
  ])('does not restore a stopped, deleted or incomplete head', async (invalid) => {
    const before = await loadScopedLibrary(scope);
    await expect(restoreConsentedAccount(scope, incoming(), invalid, member, () => true)).rejects.toThrow(/active/);
    expect(await loadScopedLibrary(scope)).toEqual(before);
  });
  it('rejects another owner and a stale auth/editor callback', async () => {
    const before = await loadScopedLibrary(scope);
    await expect(
      restoreConsentedAccount(scope, incoming(), head, { ...member, uid: 'another-user' }, () => true),
    ).rejects.toThrow();
    await expect(restoreConsentedAccount(scope, incoming(), head, member, () => false)).rejects.toThrow(/changed/);
    expect(await loadScopedLibrary(scope)).toEqual(before);
  });
  it('does not replace local dirty work or a recovery copy', async () => {
    const edited = await commitScopedAction(scope, { type: 'rate-game', record: game, score: 6.1 });
    await expect(restoreConsentedAccount(scope, incoming(), head, member, () => true)).rejects.toThrow(/changed/);
    expect(await loadScopedLibrary(scope)).toEqual(edited);
    const recovered = await restoreScopedLibrary(scope, emptyPersonalLibrary());
    await expect(restoreConsentedAccount(scope, incoming(), head, member, () => true)).rejects.toThrow();
    expect(await loadScopedLibrary(scope)).toEqual(recovered);
  });
  it('does not re-enable a previously connected, intentionally paused cache', async () => {
    const before = await loadScopedLibrary(scope);
    await connectScopedLibrary(scope, incoming(), head, member.displayName, false, {
      localRevision: before.state.revision,
      epoch: 0,
      enabled: false,
    });
    const paused = await pauseScopedLibrary(scope);
    await expect(restoreConsentedAccount(scope, incoming(), head, member, () => true)).rejects.toThrow(
      /previously connected/,
    );
    expect(await loadScopedLibrary(scope)).toEqual(paused);
  });
  it('allows only one concurrent initial adoption', async () => {
    await loadScopedLibrary(scope);
    const outcomes = await Promise.allSettled([
      restoreConsentedAccount(scope, incoming(), head, member, () => true),
      restoreConsentedAccount(scope, incoming(), head, member, () => true),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await loadScopedLibrary(scope)).sync.dataRevision).toBe(1);
  });
});

describe('owned lazy-bootstrap marker', () => {
  it('keeps fresh guests lazy and detects legacy own account keys without Firebase internals', async () => {
    const opened = vi.spyOn(indexedDB, 'open');
    expect(await readOnlineLoadHint('play100-online-48823b32')).toBe(false);
    await loadScopedLibrary(scope);
    expect(await readOnlineLoadHint('play100-online-48823b32')).toBe(true);
    expect(await readOnlineLoadHint('demo-play100')).toBe(false);
    expect(opened.mock.calls.every(([name]) => name === 'play100-personal')).toBe(true);
  });
  it('retains an explicit sign-out marker without deleting account or guest data', async () => {
    const account = await loadScopedLibrary(scope);
    await saveOnlineLoadHint(true);
    closePersonalLibrary();
    expect(await readOnlineLoadHint('play100-online-48823b32')).toBe(true);
    await saveOnlineLoadHint(false);
    closePersonalLibrary();
    expect(await readOnlineLoadHint('play100-online-48823b32')).toBe(false);
    expect(await loadScopedLibrary(scope)).toEqual(account);
  });
});
