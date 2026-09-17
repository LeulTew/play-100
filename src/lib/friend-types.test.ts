import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { emptyPersonalLibrary } from './personal-library';
import type { PublicEntry } from './community';
import {
  FRIEND_CHUNK_LIMIT, FRIEND_CHUNK_SIZE, friendPairId, friendParticipants, friendSelection, friendToken, parseFriendChunk, parseFriendGeneration,
  parseFriendGroup, parseFriendIdentity, parseFriendInvite, parseFriendPair, parseFriendSettings, parseFriendSource,
  projectFriendRanking, retainsFriendGeneration, validateFriendEntries,
} from './friend-types';
import type { FriendSettings, FriendShareHead } from './friend-types';

const avatar = { version: 1, seed: 'b'.repeat(32), palette: 'moss' };
const time = Timestamp.fromMillis(1000);
const entry: PublicEntry = { position: 1, id: 'wikidata:Q123', title: 'Example game', year: 2020, source: 'wikidata', sourceId: 'Q123', sourceUrl: 'https://www.wikidata.org/wiki/Q123', score: 0 };
const identity = { format: 1, uid: 'alice', displayName: 'Alice', avatar, revision: 1, updatedAt: time };
const settings = { format: 1, enabled: true, deleted: false, selection: entry.id, epoch: 1, revision: 1, updatedAt: time };
const pair = { format: 1, a: 'alice', b: 'bob', participants: ['alice', 'bob'], from: 'alice', state: 'pending', epoch: 1, inviteSlot: null, createdAt: time, updatedAt: time };

describe('strict friend types and selected projection', () => {
  it('keeps head pointers during prune retries even after consent changes, without changing deletion cleanup', () => {
    const current = crypto.randomUUID(); const previous = crypto.randomUUID(); const retired = crypto.randomUUID();
    const control: FriendSettings = { format: 1, enabled: true, deleted: false, selectedIds: [], epoch: 1, revision: 1, updatedAt: 1000 };
    const head: FriendShareHead = { format: 1, epoch: 1, settingsRevision: 1, revision: 2, source: { syncEpoch: 1, remoteRevision: 0 },
      current: { generation: current, count: 0, digest: '0'.repeat(64) }, previous: { generation: previous, count: 0, digest: '0'.repeat(64) }, updatedAt: 1000 };
    for (const settings of [control, { ...control, enabled: false }, { ...control, epoch: 2, revision: 2 }, { ...control, deleted: true }, null]) {
      expect(retainsFriendGeneration(current, head, settings, true)).toBe(true);
      expect(retainsFriendGeneration(previous, head, settings, true)).toBe(true);
      expect(retainsFriendGeneration(retired, head, settings, true)).toBe(false);
    }
    expect(retainsFriendGeneration(current, head, control, false)).toBe(true);
    expect(retainsFriendGeneration(current, head, { ...control, enabled: false }, false)).toBe(false);
    expect(retainsFriendGeneration(current, head, { ...control, epoch: 2 }, false)).toBe(false);
    expect(retainsFriendGeneration(current, null, control, true)).toBe(false);
  });
  it('keeps zero distinct from null and excludes all private fields', () => {
    expect(validateFriendEntries([entry], [entry.id])[0]?.score).toBe(0);
    expect(validateFriendEntries([{ ...entry, score: null }], [entry.id])[0]?.score).toBeNull();
    for (const extra of [{ notes: 'Private' }, { email: 'private@example.test' }, { queue: true }, { played: true }, { collectionRank: 1 }]) {
      expect(() => validateFriendEntries([{ ...entry, ...extra }], [entry.id])).toThrow();
    }
    expect(() => validateFriendEntries([{ ...entry, sourceUrl: 'https://example.test/redirect' }], [entry.id])).toThrow();
    expect(() => validateFriendEntries([{ ...entry, score: Number.NaN }], [entry.id])).toThrow();
  });
  it('uses exact identities, contiguous positions, a strict selection and a 200-entry maximum', () => {
    expect(friendPairId('b_b', 'a_a')).toBe('a_a~b_b');
    expect(() => friendPairId('alice', 'alice')).toThrow();
    expect(() => friendPairId('alice/other', 'bob')).toThrow();
    expect(() => friendSelection(['manual:x', 'manual:x'])).toThrow();
    expect(() => friendSelection(['manual:x|private'])).toThrow();
    expect(() => friendSelection(Array.from({ length: 201 }, (_, index) => `manual:${index}`))).toThrow();
    expect(() => validateFriendEntries([entry], [])).toThrow();
    expect(() => validateFriendEntries([{ ...entry, position: 2 }], [entry.id])).toThrow();
    expect(() => validateFriendEntries([entry, { ...entry, position: 2 }], [entry.id])).toThrow();
  });
  it('prunes removed games, allows an empty result, and never adds unselected games', () => {
    const state = emptyPersonalLibrary();
    state.records[entry.id] = { id: entry.id, title: entry.title, year: entry.year, source: entry.source, sourceId: entry.sourceId, sourceUrl: entry.sourceUrl, collectionRank: null, studio: null, genre: null };
    state.ranking = [{ id: entry.id, score: 0, note: 'Never shared', manualPosition: null }];
    const before = structuredClone(state);
    expect(projectFriendRanking(state, ['manual:removed', entry.id], [])).toEqual({ entries: [entry], selectedIds: [entry.id] });
    expect(projectFriendRanking(state, [], [])).toEqual({ entries: [], selectedIds: [] });
    expect(projectFriendRanking(state, ['manual:removed'], [])).toEqual({ entries: [], selectedIds: [] });
    expect(state).toEqual(before);
    const secondId = 'wikidata:Q124';
    state.records[secondId] = { ...state.records[entry.id]!, id: secondId, sourceId: 'Q124', sourceUrl: 'https://www.wikidata.org/wiki/Q124' };
    state.ranking.push({ id: secondId, score: null, note: '', manualPosition: null });
    const selected = [secondId, entry.id];
    expect(projectFriendRanking(state, selected, []).selectedIds).toEqual(selected);
    expect(projectFriendRanking(state, selected, []).entries.map((row) => row.id)).toEqual([entry.id, secondId]);
  });
  it('rejects arbitrary identity/control fields and malformed local avatars', () => {
    expect(parseFriendIdentity(identity).updatedAt).toBe(1000);
    expect(parseFriendSettings(settings).selectedIds).toEqual([entry.id]);
    for (const data of [{ ...identity, email: 'private@example.test' }, { ...identity, gameCount: 123 }, { ...identity, avatar: { ...avatar, photoUrl: 'https://example.test/image' } }]) {
      expect(() => parseFriendIdentity(data)).toThrow();
    }
    expect(() => parseFriendSettings({ ...settings, selection: 'manual:x|manual:x' })).toThrow();
    expect(() => parseFriendSettings({ ...settings, deleted: true })).toThrow();
    expect(() => parseFriendSettings({ ...settings, updatedAt: 1000 })).toThrow();
  });
  it('rejects forged participant arrays, unsafe epochs and non-string states', () => {
    expect(parseFriendPair(pair).participants).toEqual(['alice', 'bob']);
    expect(() => parseFriendPair({ ...pair, a: 'bob', b: 'alice' })).toThrow();
    expect(() => parseFriendPair({ ...pair, participants: ['alice', 'stranger'] })).toThrow();
    expect(() => parseFriendPair({ ...pair, from: 'stranger' })).toThrow();
    expect(() => parseFriendPair({ ...pair, epoch: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
    expect(() => parseFriendPair({ ...pair, state: ['pending'] })).toThrow();
  });
  it('bounds private groups and source revision markers', () => {
    const id = crypto.randomUUID();
    const group = { format: 1, name: 'Friends', participantUids: ['alice', 'bob'], revision: 1, createdAt: time, updatedAt: time };
    expect(parseFriendGroup(id, group).participantUids).toEqual(['alice', 'bob']);
    expect(() => friendParticipants(['alice', 'alice'])).toThrow();
    expect(() => friendParticipants(['alice'])).toThrow();
    expect(() => friendParticipants(Array.from({ length: 7 }, (_, i) => `person${i}`))).toThrow();
    expect(() => parseFriendGroup(id, { ...group, scores: [0, 10] })).toThrow();
    expect(parseFriendSource({ syncEpoch: 1, remoteRevision: 0 })).toEqual({ syncEpoch: 1, remoteRevision: 0 });
    expect(() => parseFriendSource({ syncEpoch: 0, remoteRevision: 1 })).toThrow();
    expect(() => parseFriendSource({ syncEpoch: 1, remoteRevision: 1, localRevision: 9 })).toThrow();
  });
  it('strictly validates chunk progress and protects invitation metadata', () => {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const invitation = { format: 1, ownerUid: 'alice', slot: 0, displayName: 'Alice', avatar, createdAt: time, state: 'active', acceptedBy: null };
    expect(parseFriendInvite(token, invitation).expiresAt).toBe(1000 + 7 * 86400000);
    expect(() => friendToken('malformed')).toThrow();
    expect(() => parseFriendInvite(token, { ...invitation, acceptedBy: 'bob' })).toThrow();
    expect(() => parseFriendInvite(token, { ...invitation, rankings: [entry] })).toThrow();
    expect(parseFriendChunk({ index: 0, entries: [entry], ids: [entry.id] }, 0, 1)).toEqual([entry]);
    expect(() => parseFriendChunk({ index: 0, entries: [entry], ids: ['manual:wrong'] }, 0, 1)).toThrow();
    expect(() => parseFriendChunk({ index: 0, entries: [entry], ids: [entry.id], notes: 'private' }, 0, 1)).toThrow();
    expect(() => parseFriendGeneration({ epoch: 1, settingsRevision: 1, source: { syncEpoch: 1, remoteRevision: 0 }, count: 2, digest: token, uploaded: 1, ids: [entry.id], status: 'ready', createdAt: time })).toThrow();
    expect(FRIEND_CHUNK_SIZE).toBe(2);
    expect(FRIEND_CHUNK_LIMIT).toBe(100);
    for (const count of [1, 2, 3, 4, 5, 6, 7, 199, 200]) {
      const rows = Array.from({ length: count }, (_, index): PublicEntry => ({
        ...entry, position: index + 1, id: `wikidata:Q${index + 1}`, sourceId: `Q${index + 1}`, sourceUrl: `https://www.wikidata.org/wiki/Q${index + 1}`,
      }));
      const uploaded = Math.ceil(count / FRIEND_CHUNK_SIZE);
      for (let index = 0; index < uploaded; index += 1) {
        const chunk = rows.slice(index * FRIEND_CHUNK_SIZE, (index + 1) * FRIEND_CHUNK_SIZE);
        expect(parseFriendChunk({ index, entries: chunk, ids: chunk.map((row) => row.id) }, index, count)).toEqual(chunk);
      }
      expect(parseFriendGeneration({ epoch: 1, settingsRevision: 1, source: { syncEpoch: 1, remoteRevision: 0 }, count, digest: token, uploaded,
        ids: rows.map((row) => row.id), status: 'ready', createdAt: time }).uploaded).toBe(uploaded);
    }
    expect(() => parseFriendChunk({ index: 100, entries: [entry], ids: [entry.id] }, 100, 200)).toThrow();
    expect(() => parseFriendChunk({ index: 0, entries: Array(10).fill(entry), ids: Array(10).fill(entry.id) }, 0, 200)).toThrow();
  });
});
