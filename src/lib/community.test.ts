import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  normalizeHandle,
  parseAvatar,
  parsePublicEntry,
  projectPublicRanking,
  recordFromPublic,
  reportDocumentId,
  RESERVED_HANDLES,
  reservedHandlePattern,
} from './community';
import { parseCollection } from './collection';
import { applyPersonalAction, emptyPersonalLibrary } from './personal-library';
import { recordFromGame } from './personal-types';
const games = parseCollection(
  JSON.parse(readFileSync(new URL('../../data/collection.json', import.meta.url), 'utf8')),
).games;
const first = games[0];
if (!first) throw new Error('Missing canonical fixture.');
const record = recordFromGame(first);

describe('explicit public projection and safe imports', () => {
  it('projects only selected ranking metadata, without notes, play state, queues or author ranks', () => {
    let state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record, score: 8.5 });
    state = applyPersonalAction(state, {
      type: 'edit-ranking',
      id: record.id,
      note: 'Private note containing my email.',
    });
    state = applyPersonalAction(state, { type: 'set-progress', records: [record], key: 'completed', value: true });
    const entries = projectPublicRanking(state, new Set([record.id]), games);
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual([
      'id',
      'position',
      'score',
      'source',
      'sourceId',
      'sourceUrl',
      'title',
      'year',
    ]);
    expect(JSON.stringify(entries)).not.toContain('Private note');
    expect(entries[0]?.score).toBe(8.5);
    expect(entries[0]).not.toHaveProperty('collectionRank');
    const copied = recordFromPublic(entries[0]!, games);
    expect(copied).toEqual(record);
    const viewer = applyPersonalAction(emptyPersonalLibrary(), {
      type: 'set-progress',
      records: [copied],
      key: 'later',
      value: true,
    });
    expect(viewer.ranking).toEqual([]);
    expect(viewer.progress[record.id]?.played).toBe(false);
  });
  it('rehydrates canonical identity rather than trusting a published title or implied author rank', () => {
    const state = applyPersonalAction(emptyPersonalLibrary(), {
      type: 'rate-game',
      record: { ...record, title: 'Forged title', collectionRank: 99 },
      score: 1,
    });
    const entries = projectPublicRanking(state, new Set([record.id]), games);
    expect(entries[0]?.title).toBe(first.title);
    expect(recordFromPublic({ ...entries[0]!, title: 'Malicious stranger title' }, games)).toEqual(record);
  });
  it('does not silently truncate oversized or stale selections', () => {
    expect(() => projectPublicRanking(emptyPersonalLibrary(), new Set(), games)).toThrow(/1 and 200/);
    expect(() =>
      projectPublicRanking(emptyPersonalLibrary(), new Set(Array.from({ length: 201 }, (_, n) => String(n))), games),
    ).toThrow(/200/);
    expect(() => projectPublicRanking(emptyPersonalLibrary(), new Set(['missing']), games)).toThrow(/changed/);
  });
  it('never copies a publisher score over an existing viewer score or manual position', () => {
    const published = projectPublicRanking(
      applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record, score: 2 }),
      new Set([record.id]),
      games,
    )[0]!;
    let viewer = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record, score: 9.7 });
    viewer.ranking[0]!.manualPosition = 1;
    viewer = applyPersonalAction(viewer, {
      type: 'set-progress',
      records: [recordFromPublic(published, games)],
      key: 'later',
      value: true,
    });
    expect(viewer.ranking[0]?.score).toBe(9.7);
    expect(viewer.ranking[0]?.manualPosition).toBe(1);
  });
  it('rejects arbitrary links, extra public fields and unsupported avatar content', () => {
    const entry = {
      position: 1,
      id: 'wikidata:Q123',
      title: 'Game',
      year: 2020,
      source: 'wikidata',
      sourceId: 'Q123',
      sourceUrl: 'https://www.wikidata.org/wiki/Q123',
      score: null,
    };
    expect(() => parsePublicEntry({ ...entry, note: 'Not public' })).toThrow(/unsupported/);
    expect(() => parsePublicEntry({ ...entry, sourceUrl: 'https://evil.invalid/' })).toThrow(/source link/);
    expect(() => parseAvatar({ version: 1, svg: '<svg onload=alert(1) />' })).toThrow();
    expect(() => parseAvatar({ version: 1, seed: 'alice@example.test', palette: 'lime' })).toThrow();
  });
  it('normalizes safe handles and reserves impersonation/system names', () => {
    expect(normalizeHandle('  Green_Games  ')).toBe('green_games');
    for (const handle of [
      'admin',
      'leul',
      'play100',
      'leul_tew',
      'play100_official',
      'support_team',
      'p1ay100',
      'p1ay1oo_fan',
      'adm1n',
      'admln_x',
      'creat0r',
      'ieul',
      '1eul',
      'supp0rt',
      'm0derat0r',
      'f1rebase',
      'acc0unt',
      'c0mmun1ty',
      'sett1ngs',
      '0fficial',
      'offic1al',
      '_name',
      'two words',
      'xx',
      'x'.repeat(25),
    ])
      expect(() => normalizeHandle(handle)).toThrow();
  });
  it('keeps the client reserved prefixes identical to the rules alternation', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    const prefixes = /!handle\.matches\('\^\(([^)]+)\)\.\*'\)/.exec(rules)?.[1]?.split('|');
    expect(prefixes).toBeDefined();
    expect(prefixes?.sort()).toEqual(RESERVED_HANDLES.map(reservedHandlePattern).sort());
    expect(reservedHandlePattern('play100')).toBe('p[il1]ay[il1][o0][o0]');
    expect(reservedHandlePattern('system')).toBe('system');
  });
  it('still accepts ordinary handles that merely resemble a reserved word later in the name', () => {
    for (const handle of ['my_admin', 'the_official', 'pilot_games', 'sysadmin', 'leu_games', 'playlist'])
      expect(normalizeHandle(handle)).toBe(handle);
  });
  it('uses exactly one report separator for provider-shaped and hyphenated demo UIDs', () => {
    const target = 'A'.repeat(28);
    const reporter = 'b'.repeat(28);
    expect(reportDocumentId(target, reporter)).toBe(`${target}_${reporter}`);
    expect(reportDocumentId('target-demo', 'reporter-demo')).toBe('target-demo_reporter-demo');
  });
  it('rejects underscores in either report UID instead of producing an ambiguous persisted ID', () => {
    expect(() => reportDocumentId('Target_Alice', 'Bob')).toThrow(/Reports require account IDs/);
    expect(() => reportDocumentId('Target', 'Alice_Bob')).toThrow(/Reports require account IDs/);
    for (const uid of ['', 'a'.repeat(129), 'with/slash']) {
      expect(() => reportDocumentId(uid, 'Reporter')).toThrow(/Reports require account IDs/);
      expect(() => reportDocumentId('Target', uid)).toThrow(/Reports require account IDs/);
    }
  });
});
