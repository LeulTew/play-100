import { describe, expect, it } from 'vitest';
import { parsePublicEntry, projectOwnRanking, projectPublicRanking, recordFromPublic } from './community';
import type { PublicEntry } from './community';
import { parseFriendChunk, projectFriendRanking, validateFriendEntries } from './friend-types';
import { applyPersonalAction, createLibraryBackup, emptyPersonalLibrary, parseLibraryBackup, parsePersonalLibrary } from './personal-library';
import type { LibraryRecord } from './personal-types';

const prefix = 'https://www.freetogame.com/';
const sourceLink = (length: number) => prefix + 'a'.repeat(length - prefix.length);
const record = (length: number): LibraryRecord => ({
  id: 'freetogame:10', source: 'freetogame', sourceId: '10', sourceUrl: sourceLink(length),
  title: 'Publication boundary fixture', year: null, collectionRank: null, studio: null, genre: null,
});
const published = (length: number): PublicEntry => ({
  position: 1, id: 'freetogame:10', source: 'freetogame', sourceId: '10', sourceUrl: sourceLink(length),
  title: 'Publication boundary fixture', year: null, score: 7,
});

describe('new-publication source URL boundaries without private or historical migration', () => {
  it('accepts exactly2048 characters for public and selected-ranking publication', () => {
    const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: record(2048), score: 7 });
    expect(projectPublicRanking(state, new Set(['freetogame:10']), [])).toEqual([published(2048)]);
    expect(projectFriendRanking(state, ['freetogame:10'], []).entries).toEqual([published(2048)]);
    expect(validateFriendEntries([published(2048)], ['freetogame:10'])).toEqual([published(2048)]);
  });

  it('rejects a newly published2049-character link actionably without changing private ranking or backup data', () => {
    let state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: record(2049), score: 7 });
    state = applyPersonalAction(state, { type: 'edit-ranking', id: 'freetogame:10', note: 'Keep this private draft.' });
    const before = structuredClone(state);
    expect(parsePersonalLibrary(state)).toEqual(before);
    expect(parseLibraryBackup(createLibraryBackup(state))).toEqual(before);
    expect(projectOwnRanking(state, [])).toEqual([published(2049)]);
    expect(() => projectPublicRanking(state, new Set(['freetogame:10']), [])).toThrow(/source link.*2048.*private/i);
    expect(() => projectFriendRanking(state, ['freetogame:10'], [])).toThrow(/source link.*2048.*private/i);
    expect(() => validateFriendEntries([published(2049)], ['freetogame:10'])).toThrow(/source link.*2048.*private/i);
    expect(state).toEqual(before);
  });

  it.each([2049, 8192])('keeps historical%s-character public and selected-ranking entries readable and importable', length => {
    const entry = published(length);
    expect(parsePublicEntry(entry)).toEqual(entry);
    expect(parseFriendChunk({ index: 0, entries: [entry], ids: [entry.id] }, 0, 1)).toEqual([entry]);
    expect(recordFromPublic(entry, [])).toEqual(record(length));
  });
});
