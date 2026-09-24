import { describe, expect, it } from 'vitest';
import { emptyPersonalLibrary } from './personal-library';
import type { PersonalLibraryState } from './personal-types';
import type { FriendSettings } from './friend-types';
import type { FriendShelfConfig } from './friend-shelf-types';
import type { FriendAllFacts, FriendAllPolicy } from './friend-all';
import { friendAllEligibility, parseFriendAllRankingEntry, planFriendAllChanges, projectAllFriendGames, projectAllFriendRankings } from './friend-all';
import { compareFriendRankings } from './friend-comparison';
import type { ComparisonParticipant } from './friend-comparison';

const ranking: FriendSettings = { format: 1, enabled: true, deleted: false, selectedIds: [], epoch: 2, revision: 2, updatedAt: 1 };
const shelf: FriendShelfConfig = { ...ranking, consentSyncEpoch: 4 };
const policy: FriendAllPolicy = { format: 2, uid: 'account-a', enabled: true, deleted: false, origin: 'default', epoch: 1, revision: 1, syncEpoch: 4, ranking: { epoch: 2, revision: 2 }, shelf: { epoch: 2, revision: 2 }, updatedAt: 1 };
function facts(patch: Partial<FriendAllFacts> = {}): FriendAllFacts {
  return { uid: 'account-a', scope: 'account:demo-play100:account-a', projectId: 'demo-play100', verified: true, cacheReady: true, confirmed: true, source: { enabled: true, deleted: false, epoch: 4 }, ranking: null, shelf: null, policy: null, ...patch };
}
function library(count: number): PersonalLibraryState {
  const state = emptyPersonalLibrary();
  for (let index = 1; index <= count; index += 1) {
    const id = `wikidata:Q${index}`;
    state.records[id] = { id, title: `Game ${index}`, year: 2020, source: 'wikidata', sourceId: `Q${index}`, sourceUrl: `https://www.wikidata.org/wiki/Q${index}`, studio: 'Private imported studio', genre: 'Private imported genre', collectionRank: null };
    state.ranking.push({ id, score: index === 1 ? 0 : null, note: 'Never publish this private note', manualPosition: index });
    state.progress[id] = { later: true, played: true, completed: true };
    state.queueOrder.push(id);
  }
  return state;
}

describe('versioned all-account sharing eligibility', () => {
  it('defaults only a genuinely new confirmed eligible account setup', () => {
    expect(friendAllEligibility(facts())).toEqual({ kind: 'default', canEnable: true });
    expect(friendAllEligibility(facts({ confirmed: false }))).toEqual({ kind: 'checking' });
    expect(friendAllEligibility(facts({ cacheReady: false })).kind).toBe('paused');
    expect(friendAllEligibility(facts({ source: null })).kind).toBe('paused');
    expect(friendAllEligibility(facts({ verified: false })).kind).toBe('paused');
    expect(friendAllEligibility(facts({ scope: 'guest' })).kind).toBe('paused');
  });
  it.each([
    { ranking: { ...ranking, enabled: false } },
    { ranking: { ...ranking, selectedIds: ['wikidata:Q1'] } },
    { shelf: { ...shelf, enabled: false, consentSyncEpoch: null } },
    { ranking, shelf },
  ])('preserves every existing legacy control rather than inferring missing consent: %j', patch => {
    expect(friendAllEligibility(facts(patch))).toEqual({ kind: 'legacy', reason: 'existing-choice', canEnable: true });
  });
  it('recognizes current all-mode bindings and never turns a recorded Stop back on', () => {
    expect(friendAllEligibility(facts({ ranking, shelf, policy }))).toEqual({ kind: 'all', canEnable: false });
    expect(friendAllEligibility(facts({ ranking, shelf, policy: { ...policy, enabled: false, origin: 'explicit' } }))).toEqual({ kind: 'off', canEnable: true });
  });
  it('treats a disabled default as a setup waiting for online saving, not as a recorded Stop', () => {
    const waiting: Partial<FriendAllFacts> = { ranking: { ...ranking, enabled: false }, shelf: { ...shelf, enabled: false, consentSyncEpoch: null }, policy: { ...policy, enabled: false } };
    expect(friendAllEligibility(facts(waiting))).toEqual({ kind: 'default', canEnable: true });
    expect(friendAllEligibility(facts({ ...waiting, source: null }))).toEqual({ kind: 'paused', reason: 'saving', canEnable: false });
    expect(friendAllEligibility(facts({ ...waiting, source: { enabled: false, deleted: false, epoch: 5 } }))).toEqual({ kind: 'paused', reason: 'saving', canEnable: false });
    expect(friendAllEligibility(facts({ ...waiting, policy: { ...policy, enabled: false, origin: 'explicit' } }))).toEqual({ kind: 'off', canEnable: true });
    expect(friendAllEligibility(facts({ ...waiting, ranking: { ...ranking, enabled: false, epoch: 3, revision: 3 } }))).toEqual({ kind: 'legacy', reason: 'changed-controls', canEnable: true });
  });
  it('treats either old-client Stop or selection change as authoritative', () => {
    for (const enabled of [false, true]) {
      expect(friendAllEligibility(facts({ ranking: { ...ranking, enabled, epoch: 3, revision: 3 }, shelf, policy }))).toEqual({ kind: 'legacy', reason: 'changed-controls', canEnable: true });
      expect(friendAllEligibility(facts({ ranking, shelf: { ...shelf, enabled, epoch: 3, revision: 3 }, policy }))).toEqual({ kind: 'legacy', reason: 'changed-controls', canEnable: true });
    }
    expect(friendAllEligibility(facts({ ranking: { ...ranking, selectedIds: ['wikidata:Q1'] }, shelf, policy })).kind).toBe('legacy');
  });
  it('keeps pause and saving-epoch restart distinct from active sharing', () => {
    expect(friendAllEligibility(facts({ ranking, shelf, policy, source: { enabled: false, deleted: false, epoch: 5 } }))).toEqual({ kind: 'paused', reason: 'saving', canEnable: false });
    expect(friendAllEligibility(facts({ ranking, shelf, policy, source: { enabled: true, deleted: false, epoch: 6 } }))).toEqual({ kind: 'paused', reason: 'saving-restarted', canEnable: true });
  });
  it.each([
    { source: { enabled: false, deleted: true, epoch: 5 } },
    { ranking: { ...ranking, enabled: false, deleted: true } },
    { shelf: { ...shelf, enabled: false, deleted: true, consentSyncEpoch: null } },
    { policy: { ...policy, enabled: false, deleted: true } },
  ])('never defaults or resumes a deleted scope: %j', patch => {
    expect(friendAllEligibility(facts(patch))).toEqual({ kind: 'revoked', canEnable: false });
  });
  it('rejects a foreign policy and never adopts the guest scope', () => {
    expect(() => friendAllEligibility(facts({ ranking, shelf, policy: { ...policy, uid: 'account-b' } }))).toThrow('another account');
    expect(friendAllEligibility(facts({ uid: 'account-b', ranking, shelf, policy })).kind).toBe('paused');
    expect(friendAllEligibility(facts({ scope: 'account:play100-online-48823b32:account-a', ranking, shelf, policy })).kind).toBe('paused');
  });
});

describe('complete, privacy-limited all-account projection', () => {
  it('projects all10,000 games and rankings without the old200-entry truncation', () => {
    const state = library(10_000);
    const games = projectAllFriendGames(state, []);
    const ranks = projectAllFriendRankings(state, []);
    expect(games).toHaveLength(10_000);
    expect(ranks).toHaveLength(10_000);
    expect(ranks.find(entry => entry.id === 'wikidata:Q10000')?.position).toBe(10_000);
    expect(ranks.find(entry => entry.id === 'wikidata:Q1')?.score).toBe(0);
    expect(ranks.find(entry => entry.id === 'wikidata:Q2')?.score).toBeNull();
    const first = games[0];
    if (!first) throw new Error('The complete projection unexpectedly has no first game.');
    expect(Object.keys(first).sort()).toEqual(['id', 'source', 'sourceId', 'sourceUrl', 'title', 'year']);
    expect(JSON.stringify({ games, ranks })).not.toMatch(/Never publish|Private imported|later|played|completed|queueOrder|manualPosition/);
  });

  describe('paged comparison knowledge', () => {
    const entries = projectAllFriendRankings(library(203), []);
    const q1 = entries.find(entry => entry.id === 'wikidata:Q1')!;
    const q202 = entries.find(entry => entry.id === 'wikidata:Q202')!;
    const self: ComparisonParticipant = { id: 'a', displayName: 'Self', kind: 'self', availability: 'ready', freshness: 'fresh', entries: [q1, q202] };
    const peer: ComparisonParticipant = { id: 'b', displayName: 'Friend', kind: 'friend', availability: 'ready', freshness: 'fresh', entries: [q1], coverage: { kind: 'page', total: 203 } };
    it('does not report an unfetched rank as absent, unrated, a complete pair or a valid mean', () => {
      const compared = compareFriendRankings([self, peer]);
      expect(compared.cohort.incomplete).toBe(true);
      expect(compared.summary.sharedGameCount).toBeNull();
      expect(compared.summary.pairs[0]?.meanAbsoluteScoreGap).toBeNull();
      const unqueried = compared.rows['all-shared'].find(row => row.game.id === q202.id);
      expect(unqueried?.cells[1]?.status).toBe('unfetched');
      expect(unqueried?.meanScore).toBeNull();
      expect(compared.rows['common-ranked'].map(row => row.game.id)).toEqual([q1.id]);
    });
    it('marks an exact absent identity known without pretending the whole203-game list was read', () => {
      const compared = compareFriendRankings([self, { ...peer, coverage: { kind: 'exact', total: 203, ids: [q1.id, q202.id] } }]);
      expect(compared.rows['all-shared'].find(row => row.game.id === q202.id)?.cells[1]?.status).toBe('absent');
      expect(compared.summary.sharedGameCount).toBeNull();
    });
    it('accepts a real rank beyond200 only with explicit new coverage and refuses malformed coverage', () => {
      expect(compareFriendRankings([self, { ...peer, entries: [q202] }]).rows['all-shared'].find(row => row.game.id === q202.id)?.cells[1]).toMatchObject({ status: 'ranked', position: 202 });
      expect(() => compareFriendRankings([self, { ...peer, coverage: { kind: 'exact', total: 203, ids: [q1.id] }, entries: [q202] }])).toThrow('unresolved');
      expect(() => compareFriendRankings([self, { ...peer, coverage: { kind: 'complete', total: 203 } }])).toThrow('coverage');
    });
  });
  it('rejects excess capacity and private or malformed ranking fields', () => {
    expect(() => projectAllFriendGames(library(10_001), [])).toThrow('10,000');
    const entry = projectAllFriendRankings(library(1), [])[0];
    expect(() => parseFriendAllRankingEntry({ ...entry, note: 'private' })).toThrow();
    expect(() => parseFriendAllRankingEntry({ ...entry, position: 10_001 })).toThrow();
    expect(() => parseFriendAllRankingEntry({ ...entry, score: Number.NaN })).toThrow();
  });
  it('handles empty, new, removed and re-added games through current membership without selected-mode suppression', () => {
    const state = library(202);
    const all = projectAllFriendGames(state, []);
    expect(planFriendAllChanges([], all)).toMatchObject({ count: 202, removals: [] });
    const next = { ...state, records: { ...state.records } };
    delete next.records['wikidata:Q202'];
    const removed = projectAllFriendGames(next, []);
    expect(planFriendAllChanges(all, removed)).toEqual({ count: 201, upserts: [], removals: ['wikidata:Q202'] });
    expect(planFriendAllChanges(removed, all)).toEqual({ count: 202, upserts: [all.find(entry => entry.id === 'wikidata:Q202')], removals: [] });
    expect(planFriendAllChanges(all, [])).toMatchObject({ count: 0, upserts: [], removals: expect.arrayContaining(['wikidata:Q202']) });
  });
  it('plans one changed ranking record rather than rewriting the complete projection', () => {
    const before = projectAllFriendRankings(library(250), []);
    const after = before.map(entry => entry.id === 'wikidata:Q201' ? { ...entry, score: 8.5 } : entry);
    expect(planFriendAllChanges(before, after)).toEqual({ count: 250, upserts: [after.find(entry => entry.id === 'wikidata:Q201')], removals: [] });
    expect(planFriendAllChanges(after, after)).toEqual({ count: 250, upserts: [], removals: [] });
    const reordered = after.map(entry => ({ score: entry.score, position: entry.position, sourceUrl: entry.sourceUrl, sourceId: entry.sourceId, source: entry.source, year: entry.year, title: entry.title, id: entry.id }));
    expect(planFriendAllChanges(after, reordered)).toEqual({ count: 250, upserts: [], removals: [] });
  });
});
