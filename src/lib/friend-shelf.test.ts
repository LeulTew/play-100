import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCollection } from './collection';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';
import { recordFromGame } from './personal-types';
import type { LibraryRecord } from './personal-types';
import {
  FRIEND_SHELF_CHUNK_LIMIT,
  FRIEND_SHELF_CHUNK_SIZE,
  FriendShelfCommittedError,
  friendShelfDigest,
  parseFriendShelfChunk,
  parseFriendShelfConfig,
  parseFriendShelfEntry,
  projectFriendShelf,
  recordFromFriendShelf,
  validateFriendShelfEntries,
} from './friend-shelf-types';
import {
  applyShelfRemovals,
  friendShelfSelectionKey,
  parseShelfSelectionCache,
  pendingShelfRemovals,
  rememberShelfSelection,
} from './friend-shelf-selection';
import { accountScope } from './cloud-types';

const manual: LibraryRecord = {
  id: 'manual:example',
  title: 'Saved, not ranked',
  year: null,
  studio: null,
  genre: null,
  source: 'manual',
  sourceId: 'example',
  sourceUrl: null,
  collectionRank: null,
};
const entry = {
  id: manual.id,
  title: manual.title,
  year: manual.year,
  source: manual.source,
  sourceId: manual.sourceId,
  sourceUrl: manual.sourceUrl,
};
const games = parseCollection(
  JSON.parse(readFileSync(new URL('../../public/data/collection.json', import.meta.url), 'utf8')),
).games;

describe('selected saved-library shelf, not a ranking projection', () => {
  it('includes selected unranked manual and catalog additions, never queue/history/score/notes', () => {
    const catalog: LibraryRecord = {
      ...manual,
      id: 'wikidata:Q12',
      source: 'wikidata',
      sourceId: 'Q12',
      sourceUrl: 'https://www.wikidata.org/wiki/Q12',
    };
    let state = applyPersonalAction(emptyPersonalLibrary(), { type: 'add-records', records: [manual, catalog] });
    const before = structuredClone(state);
    expect(projectFriendShelf(state, [manual.id, catalog.id], []).entries).toEqual([
      entry,
      { ...entry, id: catalog.id, source: catalog.source, sourceId: catalog.sourceId, sourceUrl: catalog.sourceUrl },
    ]);
    expect(state.ranking).toEqual([]);
    expect(state).toEqual(before);
    state = applyPersonalAction(state, { type: 'rate-game', record: manual, score: 0 });
    state = applyPersonalAction(state, { type: 'edit-ranking', id: manual.id, note: 'Private note' });
    state = applyPersonalAction(state, { type: 'set-progress', records: [manual], key: 'played', value: true });
    expect(projectFriendShelf(state, [manual.id], []).entries).toEqual([entry]);
    expect(projectFriendShelf(state, [], []).entries).toEqual([]);
  });
  it('canonicalizes saved original records and refuses unknown canonical identities', () => {
    const original = recordFromGame(games[0]!);
    const state = applyPersonalAction(emptyPersonalLibrary(), {
      type: 'add-records',
      records: [{ ...original, title: 'Forged local title' }],
    });
    const shared = projectFriendShelf(state, [original.id], games).entries[0]!;
    expect(shared.title).toBe(original.title);
    expect(recordFromFriendShelf(shared, games)).toEqual(original);
    expect(() => recordFromFriendShelf({ ...shared, title: 'Forged source title' }, games)).toThrow();
    expect(() => projectFriendShelf(state, [original.id], [])).toThrow();
  });
  it('prunes removals and suppresses re-adds until a fresh explicit selection', () => {
    let state = applyPersonalAction(emptyPersonalLibrary(), { type: 'add-records', records: [manual] });
    state = applyPersonalAction(state, { type: 'remove-records', ids: [manual.id] });
    expect(projectFriendShelf(state, [manual.id], []).selectedIds).toEqual([]);
    state = applyPersonalAction(state, { type: 'add-records', records: [manual] });
    expect(projectFriendShelf(state, [manual.id], [], new Set([manual.id])).entries).toEqual([]);
    expect(projectFriendShelf(state, [manual.id], []).entries).toEqual([entry]);
  });
  it('rejects every private/ranking/art field, malformed sources and noncanonical URLs', () => {
    for (const key of [
      'position',
      'score',
      'note',
      'email',
      'queue',
      'played',
      'completed',
      'imageUrl',
      'avatar',
      'studio',
      'genre',
    ]) {
      expect(() => parseFriendShelfEntry({ ...entry, [key]: 'not allowed' })).toThrow();
    }
    for (const patch of [
      { title: '' },
      { title: '  ' },
      { title: 'x'.repeat(201) },
      { title: 'bad\nname' },
      { year: 2101 },
      { year: 1.5 },
      { id: 'manual:mismatch' },
      { sourceId: 'x/y' },
      { sourceUrl: 'data:image/svg+xml,<svg/>' },
      { source: 'wikidata', sourceId: 'Q0', id: 'wikidata:Q0', sourceUrl: 'https://www.wikidata.org/wiki/Q0' },
      {
        source: 'steam',
        sourceId: '12',
        id: 'steam:12',
        sourceUrl: 'https://store.steampowered.com/app/12/?redirect=evil',
      },
      {
        source: 'freetogame',
        sourceId: '12',
        id: 'freetogame:12',
        sourceUrl: 'https://www.freetogame.com.evil.test/game',
      },
    ]) {
      expect(() => parseFriendShelfEntry({ ...entry, ...patch })).toThrow();
    }
    expect(recordFromFriendShelf(entry, [])).toEqual(manual);
  });
  it('strictly bounds two immutable entries per chunk and all 200 selected games', async () => {
    const entries = Array.from({ length: 200 }, (_, index) => ({
      ...entry,
      id: `manual:game-${index}`,
      sourceId: `game-${index}`,
    }));
    expect(FRIEND_SHELF_CHUNK_SIZE).toBe(2);
    expect(FRIEND_SHELF_CHUNK_LIMIT).toBe(100);
    expect(
      validateFriendShelfEntries(
        entries,
        entries.map((item) => item.id),
      ),
    ).toEqual(entries);
    for (let i = 0; i < 100; i += 1) {
      const items = entries.slice(i * 2, i * 2 + 2);
      expect(parseFriendShelfChunk({ index: i, entries: items, ids: items.map((item) => item.id) }, i, 200)).toEqual(
        items,
      );
    }
    expect(() =>
      validateFriendShelfEntries([...entries, entry], [...entries.map((item) => item.id), entry.id]),
    ).toThrow();
    expect(() => validateFriendShelfEntries([entry], [])).toThrow();
    expect(() =>
      parseFriendShelfChunk({ index: 0, entries: [entry, entry], ids: [entry.id, entry.id] }, 0, 2),
    ).toThrow();
    expect(() => parseFriendShelfChunk({ index: 0, entries: [entry], ids: [entry.id], extra: 1 }, 0, 1)).toThrow();
    expect(await friendShelfDigest(entries)).not.toBe(await friendShelfDigest([...entries].reverse()));
  });
  it('starts off with strict independent control metadata and ACK-only error shape', () => {
    const config = {
      format: 1,
      enabled: false,
      deleted: false,
      consentSyncEpoch: null,
      selection: '',
      epoch: 1,
      revision: 1,
      updatedAt: Timestamp.fromMillis(1000),
    };
    expect(parseFriendShelfConfig(config)).toMatchObject({ enabled: false, selectedIds: [], updatedAt: 1000 });
    expect(() => parseFriendShelfConfig({ ...config, updatedAt: Date.now() })).toThrow();
    expect(() => parseFriendShelfConfig({ ...config, deleted: true, enabled: true })).toThrow();
    expect(() => parseFriendShelfConfig({ ...config, enabled: true, consentSyncEpoch: null })).toThrow();
    expect(() => parseFriendShelfConfig({ ...config, consentSyncEpoch: 1 })).toThrow();
    expect(parseFriendShelfConfig({ ...config, enabled: true, consentSyncEpoch: 1 }).consentSyncEpoch).toBe(1);
    const error = new FriendShelfCommittedError(
      { uid: 'owner', operation: 'publish-shelf', generation: crypto.randomUUID(), revision: 3 },
      new Error('Readback unavailable'),
    );
    expect(error).toMatchObject({ committed: true, code: 'committed-refresh-failed', phase: 'refresh' });
    expect(error.receipt).not.toHaveProperty('updatedAt');
  });
});
describe('independent sticky shelf removal journal', () => {
  it('keeps remove/re-add suppression while ranking-only and metadata changes keep selection', () => {
    let value = rememberShelfSelection(undefined, 1, [entry.id], 1);
    value = applyShelfRemovals(value, [], 1, 2)!;
    expect(pendingShelfRemovals(value, 2).size).toBe(0);
    value = applyShelfRemovals(value, [entry.id], 2, 3)!;
    value = applyShelfRemovals(value, [], 3, 4)!;
    value = rememberShelfSelection(value, 2, [entry.id], 4);
    expect(pendingShelfRemovals(value, 4).has(entry.id)).toBe(true);
    value = rememberShelfSelection(value, 3, [entry.id], 4, 2);
    expect(pendingShelfRemovals(value, 4).has(entry.id)).toBe(true);
    value = rememberShelfSelection(value, 4, [entry.id], 4, 4);
    expect(pendingShelfRemovals(value, 4).size).toBe(0);
  });
  it('does not let older ACKs erase newer selection/removal work', () => {
    let value = rememberShelfSelection(undefined, 5, [entry.id], 10, 10);
    value = applyShelfRemovals(value, [entry.id], 10, 11)!;
    expect(rememberShelfSelection(value, 3, [], 8, 8)).toEqual(value);
    const ack = rememberShelfSelection(value, 6, [entry.id], 10, 10);
    expect(pendingShelfRemovals(ack, 11).has(entry.id)).toBe(true);
  });
  it('keeps an old-writer gap blocked across newer writes until explicit review', () => {
    let value = rememberShelfSelection(undefined, 1, [entry.id], 1);
    expect(() => pendingShelfRemovals(value, 3)).toThrow(/older tab/);
    value = applyShelfRemovals(value, [], 3, 4)!;
    value = rememberShelfSelection(value, 1, [entry.id], 4);
    expect(() => pendingShelfRemovals(value, 4)).toThrow(/older tab/);
    value = rememberShelfSelection(value, 2, [entry.id], 4, 4);
    expect(pendingShelfRemovals(value, 4).size).toBe(0);
  });
  it('requires review for absent/corrupt journal and rejects unsafe revisions', () => {
    expect(() => pendingShelfRemovals(undefined, 0)).toThrow();
    for (const value of [{ version: 1, blocked: true }, { x: 1 }, null]) {
      expect(() => parseShelfSelectionCache(value)).toThrow();
      expect(() => rememberShelfSelection(value, 1, [entry.id], 0)).toThrow();
      expect(rememberShelfSelection(value, 1, [entry.id], 0, 0).selected).toEqual([entry.id]);
    }
    expect(() => applyShelfRemovals(undefined, [], 3, 3)).toThrow();
    expect(() => rememberShelfSelection(undefined, Number.NaN, [], 0)).toThrow();
    expect(friendShelfSelectionKey(accountScope('a'))).not.toBe(friendShelfSelectionKey(accountScope('b')));
    expect(friendShelfSelectionKey(accountScope('a'))).not.toBe(`friends-selection:v1:${accountScope('a')}`);
  });
});
