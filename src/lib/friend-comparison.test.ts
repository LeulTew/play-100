import { describe, expect, it } from 'vitest';
import {
  compareFriendRankings,
  comparisonGameKey,
  FRIEND_COMPARISON_LIMITS,
  FriendComparisonValidationError,
  getComparisonPage,
} from './friend-comparison';
import type {
  ComparisonAvailability,
  ComparisonEntry,
  ComparisonPageOptions,
  ComparisonParticipant,
  FriendComparison,
} from './friend-comparison';

function game(
  sourceId: string,
  position = 1,
  score: number | null = null,
  fields: Partial<ComparisonEntry> = {},
): ComparisonEntry {
  return {
    id: sourceId,
    title: `Game ${sourceId}`,
    year: 2020,
    source: 'collection',
    sourceId,
    sourceUrl: null,
    position,
    score,
    ...fields,
  };
}

function sourced(
  source: ComparisonEntry['source'],
  sourceId: string,
  position = 1,
  score: number | null = null,
): ComparisonEntry {
  return game(sourceId, position, score, {
    source,
    id: source === 'collection' ? sourceId : `${source}:${sourceId}`,
    title: 'The same title',
  });
}

function ready(
  id: string,
  entries: readonly ComparisonEntry[] = [],
  kind: 'self' | 'friend' = 'friend',
): ComparisonParticipant {
  return { id, displayName: `Person ${id}`, kind, availability: 'ready', freshness: 'fresh', updatedAt: 123, entries };
}

it('uses bounded indexed participant and entry arrays rather than overridden iterators', () => {
  const entries = [game('a')];
  entries[Symbol.iterator] = function* () {
    for (let index = 0; index < 250; index += 1) yield game(`fake-${index}`, index + 1);
    return undefined;
  };
  const input = [ready('one', entries), ready('two', [game('a')])];
  input[Symbol.iterator] = function* () {
    for (let index = 0; index < 7; index += 1) yield ready(`fake-${index}`);
    return undefined;
  };
  const result = compareFriendRankings(input);
  expect(result.participants.map((person) => person.id)).toEqual(['one', 'two']);
  expect(result.rows['all-shared'].map((value) => value.game.id)).toEqual(['a']);
});

function unready(id: string, availability: Exclude<ComparisonAvailability, 'ready'>): ComparisonParticipant {
  return { id, displayName: `Person ${id}`, kind: 'friend', availability, freshness: 'unknown', updatedAt: null };
}

function row(comparison: FriendComparison, key: string) {
  const found = comparison.rows['all-shared'].find((entry) => entry.key === key);
  if (!found) throw new Error(`Missing row ${key}`);
  return found;
}

function reject(input: unknown) {
  expect(() => compareFriendRankings(input as readonly ComparisonParticipant[])).toThrow(
    FriendComparisonValidationError,
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

describe('exact friend ranking comparisons', () => {
  it('distinguishes zero, unrated, and absent entries without rounding scores', () => {
    const comparison = compareFriendRankings([
      ready('a', [game('zero', 1, 0), game('unrated', 2), game('solo', 3, 7.123456789)]),
      ready('b', [game('zero', 2, 0), game('unrated', 1, 0)]),
    ]);
    expect(row(comparison, 'collection:zero')).toMatchObject({
      coverage: 2,
      raterCount: 2,
      meanScore: 0,
      scoreSpread: 0,
      scoreDifference: 0,
      cells: [
        { status: 'ranked', score: 0, position: 1 },
        { status: 'ranked', score: 0, position: 2 },
      ],
    });
    expect(row(comparison, 'collection:unrated')).toMatchObject({
      coverage: 2,
      raterCount: 1,
      meanScore: 0,
      scoreSpread: null,
      scoreDifference: null,
      cells: [
        { status: 'ranked', score: null },
        { status: 'ranked', score: 0 },
      ],
    });
    expect(row(comparison, 'collection:solo')).toMatchObject({
      coverage: 1,
      raterCount: 1,
      meanScore: 7.123456789,
      scoreSpread: null,
      scoreDifference: null,
      cells: [
        { status: 'ranked', score: 7.123456789 },
        { status: 'absent', score: null, position: null },
      ],
    });
    expect(comparison.summary).toEqual({
      availableGameCount: 3,
      sharedGameCount: 2,
      jointlyRatedCount: 1,
      pairs: [
        {
          participantIds: ['a', 'b'],
          incomplete: false,
          hasStaleData: false,
          sharedGameCount: 2,
          jointlyRatedCount: 1,
          meanAbsoluteScoreGap: 0,
        },
      ],
    });
  });

  it('keeps entirely unrated common games ranked, but leaves score aggregates unknown', () => {
    const comparison = compareFriendRankings([ready('a', [game('unrated')]), ready('b', [game('unrated')])]);
    expect(comparison.rows['common-ranked']).toHaveLength(1);
    expect(row(comparison, 'collection:unrated')).toMatchObject({
      coverage: 2,
      raterCount: 0,
      meanScore: null,
      scoreSpread: null,
      scoreDifference: null,
    });
    expect(comparison.summary).toMatchObject({
      sharedGameCount: 1,
      jointlyRatedCount: 0,
      pairs: [{ sharedGameCount: 1, jointlyRatedCount: 0, meanAbsoluteScoreGap: null }],
    });
  });

  it('reports a signed first-minus-second difference and an unsigned pair gap', () => {
    const a = ready('a', [game('same', 1, 0)]);
    const b = ready('b', [game('same', 1, 10)]);
    expect(row(compareFriendRankings([a, b]), 'collection:same')).toMatchObject({
      scoreDifference: -10,
      scoreSpread: 10,
      meanScore: 5,
    });
    const reversed = compareFriendRankings([b, a]);
    expect(row(reversed, 'collection:same').scoreDifference).toBe(10);
    expect(reversed.summary.pairs[0]?.meanAbsoluteScoreGap).toBe(10);
  });

  it.each([
    { name: 'two empty lists', a: [], b: [], union: 0 },
    { name: 'one empty list', a: [game('a')], b: [], union: 1 },
    { name: 'disjoint lists', a: [game('a')], b: [game('b')], union: 2 },
  ])('handles $name without inventing score agreement', ({ a, b, union }) => {
    const comparison = compareFriendRankings([ready('a', a), ready('b', b)]);
    expect(comparison.cohort.incomplete).toBe(false);
    expect(comparison.rows['common-ranked']).toEqual([]);
    expect(comparison.rows['all-shared']).toHaveLength(union);
    expect(comparison.summary).toMatchObject({
      availableGameCount: union,
      sharedGameCount: 0,
      jointlyRatedCount: 0,
      pairs: [{ incomplete: false, sharedGameCount: 0, jointlyRatedCount: 0, meanAbsoluteScoreGap: null }],
    });
  });

  it('compares identical lists including null and zero with an optional, not required, self', () => {
    const entries = [game('a', 3, 8), game('b', 1), game('c', 2, 0)];
    const comparison = compareFriendRankings([ready('a', entries), ready('b', entries)]);
    expect(comparison.participants.every(({ kind }) => kind === 'friend')).toBe(true);
    expect(comparison.summary).toMatchObject({
      sharedGameCount: 3,
      jointlyRatedCount: 2,
      pairs: [{ sharedGameCount: 3, jointlyRatedCount: 2, meanAbsoluteScoreGap: 0 }],
    });
  });

  it('calculates each group pair using its own actually commonly rated subset', () => {
    const comparison = compareFriendRankings([
      ready('a', [game('x', 1, 0), game('y', 2, 8), game('z', 3, 2), game('u', 4)]),
      ready('b', [game('x', 1, 2), game('y', 2, 4), game('w', 3, 10), game('u', 4, 10)]),
      ready('c', [game('x', 1, 10), game('z', 2, 5), game('w', 3, 9)]),
    ]);
    expect(comparison.summary.sharedGameCount).toBe(1);
    expect(comparison.summary.jointlyRatedCount).toBe(1);
    expect(comparison.summary.pairs).toEqual([
      {
        participantIds: ['a', 'b'],
        incomplete: false,
        hasStaleData: false,
        sharedGameCount: 3,
        jointlyRatedCount: 2,
        meanAbsoluteScoreGap: 3,
      },
      {
        participantIds: ['a', 'c'],
        incomplete: false,
        hasStaleData: false,
        sharedGameCount: 2,
        jointlyRatedCount: 2,
        meanAbsoluteScoreGap: 6.5,
      },
      {
        participantIds: ['b', 'c'],
        incomplete: false,
        hasStaleData: false,
        sharedGameCount: 2,
        jointlyRatedCount: 2,
        meanAbsoluteScoreGap: 4.5,
      },
    ]);
    expect(row(comparison, 'collection:x')).toMatchObject({
      coverage: 3,
      raterCount: 3,
      meanScore: 4,
      scoreSpread: 10,
      scoreDifference: null,
    });
  });

  it('matches stable IDs despite renamed metadata, but never same-title different identities', () => {
    const comparison = compareFriendRankings([
      ready('a', [
        game('same', 1, 8, { title: 'Original title' }),
        sourced('wikidata', 'Q101', 2, 5),
        sourced('manual', 'copy-a', 3, 1),
      ]),
      ready('b', [
        game('same', 3, 2, { title: 'Renamed title', year: 2021 }),
        sourced('wikidata', 'Q102', 1, 5),
        sourced('manual', 'copy-b', 2, 1),
      ]),
    ]);
    expect(comparison.summary.sharedGameCount).toBe(1);
    expect(comparison.summary.availableGameCount).toBe(5);
    const matched = row(comparison, 'collection:same');
    expect(matched.game.title).toBe('Original title');
    expect(matched.cells[1]).toMatchObject({ status: 'ranked', entry: { title: 'Renamed title', year: 2021 } });
  });

  it('matches an imported exact shared manual identity, not a newly created same-title record', () => {
    const manual = sourced('manual', '123e4567-e89b-12d3-a456-426614174000', 1, 0);
    const comparison = compareFriendRankings([
      ready('self', [{ ...manual, score: 9 }, sourced('manual', 'another-copy', 2, 0)], 'self'),
      ready('friend', [manual]),
    ]);
    expect(comparison.rows['common-ranked'].map(({ key }) => key)).toEqual([manual.id]);
    expect(comparison.summary.pairs[0]).toMatchObject({
      sharedGameCount: 1,
      jointlyRatedCount: 1,
      meanAbsoluteScoreGap: 9,
    });
    expect(comparisonGameKey(sourced('manual', 'Copy'))).not.toBe(comparisonGameKey(sourced('manual', 'copy')));
  });

  it('separates providers, catalog identities, and editions even with the same title', () => {
    const identities = [
      sourced('collection', '42'),
      sourced('steam', '42'),
      sourced('freetogame', '42'),
      sourced('wikidata', 'Q42'),
      sourced('manual', '42'),
      sourced('steam', '43'),
      sourced('wikidata', 'Q43'),
    ];
    expect(new Set(identities.map(comparisonGameKey)).size).toBe(7);
    const comparison = compareFriendRankings([
      ready(
        'a',
        identities.slice(0, 4).map((entry, index) => ({ ...entry, position: index + 1 })),
      ),
      ready(
        'b',
        identities.slice(4).map((entry, index) => ({ ...entry, position: index + 1 })),
      ),
    ]);
    expect(comparison.summary.sharedGameCount).toBe(0);
    expect(comparison.rows['all-shared']).toHaveLength(7);
  });

  it('preserves sparse private/public positions and uses positions rather than array order or score', () => {
    const a = ready('a', [game('last', 10_000, 10), game('first', 9, 0)], 'self');
    const b = ready('b', [game('last', 200, 0), game('first', 17, 10)]);
    const comparison = compareFriendRankings([a, b]);
    expect(row(comparison, 'collection:last').cells.map(({ position }) => position)).toEqual([10_000, 200]);
    expect(
      getComparisonPage(comparison, { sort: { by: 'position', participantId: 'a' } }).rows.map(({ key }) => key),
    ).toEqual(['collection:first', 'collection:last']);
    expect(row(comparison, 'collection:first').cells.map(({ score }) => score)).toEqual([0, 10]);
  });

  it('preserves numeric precision in scores, means, differences, spread and pair summaries', () => {
    const a = 0.123456789123;
    const b = 9.876543210987;
    const c = 0.000000000123;
    const comparison = compareFriendRankings([
      ready('a', [game('a', 1, a), game('b', 2, c)]),
      ready('b', [game('a', 1, b), game('b', 2, 0)]),
    ]);
    const first = row(comparison, 'collection:a');
    expect(first.cells.map(({ score }) => score)).toEqual([a, b]);
    expect(first.meanScore).toBe((a + b) / 2);
    expect(first.scoreDifference).toBe(a - b);
    expect(first.scoreSpread).toBe(b - a);
    expect(row(comparison, 'collection:b').scoreDifference).toBe(c);
    expect(comparison.summary.pairs[0]?.meanAbsoluteScoreGap).toBe((Math.abs(a - b) + c) / 2);
  });

  it('has deterministic row and floating-point accumulation order independent of entry array order', () => {
    const a = [game('a', 2, 0.1), game('b', 3, 0.2), game('c', 1, 9.987654321)];
    const b = [game('c', 3, 0.01), game('b', 2, 0.03), game('a', 1, 0.07)];
    expect(compareFriendRankings([ready('a', a), ready('b', b)])).toEqual(
      compareFriendRankings([ready('a', [...a].reverse()), ready('b', [...b].reverse())]),
    );
  });

  it('never mutates or retains mutable references to inputs, including during pagination', () => {
    const entries = [game('z', 2, 0), game('a', 1, 10)];
    const input = deepFreeze([ready('a', entries), ready('b', entries)]);
    const before = JSON.stringify(input);
    const comparison = compareFriendRankings(input);
    const cell = row(comparison, 'collection:z').cells[0]!;
    expect(cell.status).toBe('ranked');
    if (cell.status === 'ranked') expect(cell.entry).not.toBe(entries[0]);
    expect(comparison.participants[0]).not.toBe(input[0]);
    deepFreeze(comparison);
    getComparisonPage(comparison, { sort: { by: 'mean-score', direction: 'desc' } });
    getComparisonPage(comparison, { query: 'z', pageSize: 1 });
    expect(JSON.stringify(input)).toBe(before);
    expect(comparison.rows['all-shared'].map(({ key }) => key)).toEqual(['collection:a', 'collection:z']);
  });
});

describe('cohort completeness and freshness', () => {
  it.each(['loading', 'unshared', 'unavailable', 'error'] as const)(
    'keeps a %s participant distinct from a ready empty list',
    (status) => {
      const comparison = compareFriendRankings([ready('a', [game('a', 1, 0)]), unready('b', status)]);
      expect(row(comparison, 'collection:a').cells[1]).toEqual({
        participantId: 'b',
        status,
        position: null,
        score: null,
      });
      expect(comparison.participants[1]?.availability).toBe(status);
      expect(comparison.cohort).toMatchObject({
        participantIds: ['a', 'b'],
        participantCount: 2,
        availableParticipantIds: ['a'],
        availableParticipantCount: 1,
        unavailableParticipantIds: ['b'],
        incomplete: true,
      });
      expect(comparison.rows['common-ranked']).toEqual([]);
      expect(comparison.summary).toMatchObject({
        sharedGameCount: null,
        jointlyRatedCount: null,
        pairs: [{ incomplete: true, sharedGameCount: null, jointlyRatedCount: null, meanAbsoluteScoreGap: null }],
      });
      expect(getComparisonPage(comparison, { mode: 'all-shared' }).cohort).toEqual(comparison.cohort);
      expect(getComparisonPage(comparison).rows).toEqual([]);
    },
  );

  it('does not label an available pair as the complete selected group', () => {
    const comparison = compareFriendRankings([
      ready('a', [game('a', 1, 0)]),
      ready('b', [game('a', 1, 4)]),
      unready('c', 'loading'),
    ]);
    expect(comparison.summary.pairs).toMatchObject([
      {
        participantIds: ['a', 'b'],
        incomplete: false,
        sharedGameCount: 1,
        jointlyRatedCount: 1,
        meanAbsoluteScoreGap: 4,
      },
      { participantIds: ['a', 'c'], incomplete: true, sharedGameCount: null },
      { participantIds: ['b', 'c'], incomplete: true, sharedGameCount: null },
    ]);
    expect(row(comparison, 'collection:a')).toMatchObject({
      coverage: 2,
      raterCount: 2,
      meanScore: 2,
      scoreSpread: 4,
      scoreDifference: null,
    });
    expect(comparison.cohort.participantCount).toBe(3);
    expect(comparison.cohort.incomplete).toBe(true);
    expect(comparison.summary.sharedGameCount).toBeNull();
    expect(comparison.summary.jointlyRatedCount).toBeNull();
  });

  it('represents an entirely unavailable cohort rather than reporting an empty successful comparison', () => {
    const comparison = compareFriendRankings([unready('a', 'unshared'), unready('b', 'error')]);
    expect(comparison.rows['all-shared']).toEqual([]);
    expect(comparison.cohort).toMatchObject({ participantCount: 2, availableParticipantCount: 0, incomplete: true });
    expect(comparison.summary.sharedGameCount).toBeNull();
    expect(comparison.summary.pairs[0]?.sharedGameCount).toBeNull();
  });

  it('preserves ready stale snapshots and explicit unknown freshness without pretending data is current', () => {
    const comparison = compareFriendRankings([
      { ...ready('a', [game('a', 1, 0)]), freshness: 'stale', updatedAt: 0 },
      { ...ready('b', [game('a', 1, 4)]), freshness: 'unknown', updatedAt: undefined },
    ]);
    expect(comparison.participants).toMatchObject([
      { id: 'a', freshness: 'stale', updatedAt: 0 },
      { id: 'b', freshness: 'unknown', updatedAt: null },
    ]);
    expect(comparison.cohort).toMatchObject({ incomplete: false, staleParticipantIds: ['a'] });
    expect(comparison.summary.pairs[0]).toMatchObject({ incomplete: false, hasStaleData: true, sharedGameCount: 1 });
  });
});

describe('strict comparison input validation', () => {
  it.each([
    { input: null },
    { input: {} },
    { input: [] },
    { input: [ready('a')] },
    { input: Array.from({ length: 7 }, (_, index) => ready(String(index))) },
    { input: Array(2) },
  ])('rejects an invalid participant collection %#', ({ input }) => reject(input));

  it('rejects duplicate participants, multiple selves, duplicate identities and duplicate positions', () => {
    reject([ready('a'), ready('a')]);
    reject([ready('a', [], 'self'), { ...unready('b', 'loading'), kind: 'self' }]);
    reject([ready('a', [game('same', 1), game('same', 2, 4, { title: 'Different metadata' })]), ready('b')]);
    reject([ready('a', [game('a', 1), game('b', 1)]), ready('b')]);
    reject([ready('a', [sourced('manual', 'exact', 1), sourced('manual', 'exact', 2)]), ready('b')]);
  });

  it('rejects oversized lists and positions using each participant kind limit', () => {
    reject([
      ready(
        'a',
        Array.from({ length: 201 }, (_, index) => game(`a-${index}`, index + 1)),
      ),
      ready('b'),
    ]);
    reject([
      ready(
        'a',
        Array.from({ length: 10_001 }, (_, index) => sourced('manual', String(index), index + 1)),
        'self',
      ),
      ready('b'),
    ]);
    reject([ready('a', [game('a', 10_001)], 'self'), ready('b')]);
    expect(FRIEND_COMPARISON_LIMITS).toEqual({
      minParticipants: 2,
      maxParticipants: 6,
      maxFriendEntries: 200,
      maxSelfEntries: 10_000,
      maxPageSize: 25,
    });
  });

  it.each([-0.1, 10.1, NaN, Infinity, -Infinity, '5', undefined])('rejects invalid score %s', (score) => {
    reject([ready('a', [{ ...game('a'), score } as ComparisonEntry]), ready('b')]);
  });

  it.each([0, -1, 1.5, 201, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null])(
    'rejects invalid friend position %s',
    (position) => {
      reject([ready('a', [{ ...game('a'), position } as ComparisonEntry]), ready('b')]);
    },
  );

  it.each([1899, 2101, 2020.5, NaN, Infinity, '2020', undefined])('rejects invalid year %s', (year) => {
    reject([ready('a', [{ ...game('a'), year } as ComparisonEntry]), ready('b')]);
  });

  it.each([
    { source: 'gog' },
    { sourceId: 'different' },
    { id: 'Upper_Case', sourceId: 'Upper_Case' },
    { id: 'bad--slug', sourceId: 'bad--slug' },
    { id: 'wikidata:q42', source: 'wikidata', sourceId: 'q42' },
    { id: 'wikidata:Q0', source: 'wikidata', sourceId: 'Q0' },
    { id: 'wikidata:Q042', source: 'wikidata', sourceId: 'Q042' },
    { id: 'steam:0', source: 'steam', sourceId: '0' },
    { id: 'steam:042', source: 'steam', sourceId: '042' },
    { id: 'steam:1.5', source: 'steam', sourceId: '1.5' },
    { id: 'freetogame:Q42', source: 'freetogame', sourceId: 'Q42' },
    { id: 'freetogame:042', source: 'freetogame', sourceId: '042' },
    { id: 'manual:a', source: 'manual', sourceId: 'b' },
    { id: 'manual:constructor', source: 'manual', sourceId: 'constructor' },
    { id: 'manual:a b', source: 'manual', sourceId: 'a b' },
    { id: 'x'.repeat(201), sourceId: 'x'.repeat(201) },
    { id: '' },
  ])('rejects unsupported or inconsistent source identities %#', (patch) => {
    const entry = { ...game('a'), ...patch } as ComparisonEntry;
    reject([ready('a', [entry]), ready('b')]);
    expect(() => comparisonGameKey(entry)).toThrow(FriendComparisonValidationError);
  });

  it.each([
    { title: '' },
    { title: '   ' },
    { title: 'x'.repeat(201) },
    { title: null },
    { sourceUrl: 'javascript:alert(1)' },
    { sourceUrl: 'http://example.test/' },
    { sourceUrl: 'https://user:password@example.test/' },
    { sourceUrl: 'https://example.test/a b' },
    { sourceUrl: 42 },
    { sourceUrl: 'https://' },
    { note: 'Not comparison metadata' },
  ])('rejects malformed metadata or unsupported entry fields %#', (patch) => {
    reject([ready('a', [{ ...game('a'), ...patch } as ComparisonEntry]), ready('b')]);
  });

  it('allows null metadata and valid HTTPS source links without using links as identities', () => {
    const a = { ...sourced('wikidata', 'Q42'), year: null, sourceUrl: 'https://www.wikidata.org/wiki/Q42' };
    const b = { ...a, sourceUrl: null };
    expect(compareFriendRankings([ready('a', [a]), ready('b', [b])]).summary.sharedGameCount).toBe(1);
  });

  it.each([
    { id: '' },
    { id: ' a ' },
    { displayName: ' ' },
    { kind: 'stranger' },
    { availability: 'complete' },
    { freshness: 'maybe' },
    { updatedAt: -1 },
    { updatedAt: NaN },
    { updatedAt: Infinity },
    { updatedAt: 1.5 },
    { entries: undefined },
    { entries: {} },
  ])('rejects malformed participant metadata or ready snapshots %#', (patch) => {
    reject([{ ...ready('a'), ...patch }, ready('b')]);
  });

  it('rejects not-ready participants carrying entries, missing fields, sparse arrays, and accessors', () => {
    reject([{ ...unready('a', 'loading'), entries: [] }, ready('b')]);
    reject([{ ...unready('a', 'unshared'), entries: [game('private')] }, ready('b')]);
    const missing: Record<string, unknown> = { ...game('a') };
    delete missing.score;
    reject([{ ...ready('a'), entries: [missing] }, ready('b')]);
    reject([{ ...ready('a'), entries: Array(1) }, ready('b')]);
    let reads = 0;
    const accessor = {
      ...game('a'),
      get score() {
        reads++;
        return 5;
      },
    };
    reject([ready('a', [accessor]), ready('b')]);
    expect(reads).toBe(0);
  });
});

describe('bounded deterministic comparison pages', () => {
  const fixture = () =>
    compareFriendRankings([
      ready('a', [
        game('z', 2, 0, { title: 'Same' }),
        game('a', 3, null, { title: 'Same' }),
        game('b', 1, 8, { title: 'alpha' }),
      ]),
      ready('b', [game('z', 2, 0, { title: 'Same' }), game('b', 1, 2, { title: 'Another name' }), game('c', 3, 10)]),
    ]);

  it('defaults to 25 common-ranked rows and supports hard-bounded pagination of all available rows', () => {
    const entries = Array.from({ length: 60 }, (_, index) =>
      game(`game-${String(index + 1).padStart(2, '0')}`, index + 1),
    );
    const comparison = compareFriendRankings([ready('a', entries), ready('b', entries.slice(0, 30))]);
    const first = getComparisonPage(comparison);
    expect(first).toMatchObject({ mode: 'common-ranked', page: 1, pageSize: 25, totalRows: 30, pageCount: 2 });
    expect(first.rows).toHaveLength(25);
    expect(getComparisonPage(comparison, { page: 2 }).rows).toHaveLength(5);
    const pages = [1, 2, 3].map((page) => getComparisonPage(comparison, { mode: 'all-shared', page }));
    expect(pages.map(({ rows }) => rows.length)).toEqual([25, 25, 10]);
    expect(pages.flatMap(({ rows }) => rows.map(({ key }) => key))).toEqual(
      comparison.rows['all-shared'].map(({ key }) => key),
    );
    expect(getComparisonPage(comparison, { mode: 'all-shared', page: 4 }).rows).toEqual([]);
    expect(getComparisonPage(comparison, { page: Number.MAX_SAFE_INTEGER }).rows).toEqual([]);
    expect(getComparisonPage(compareFriendRankings([ready('a'), ready('b')])).pageCount).toBe(0);
  });

  it('filters by case-insensitive query, shared coverage and actual rater count before paging', () => {
    const comparison = fixture();
    expect(getComparisonPage(comparison, { mode: 'all-shared', query: ' SAME ' }).rows.map(({ key }) => key)).toEqual([
      'collection:a',
      'collection:z',
    ]);
    expect(
      getComparisonPage(comparison, { mode: 'all-shared', query: 'another name' }).rows.map(({ key }) => key),
    ).toEqual(['collection:b']);
    expect(
      getComparisonPage(comparison, { mode: 'all-shared', query: 'collection:c' }).rows.map(({ key }) => key),
    ).toEqual(['collection:c']);
    expect(getComparisonPage(comparison, { mode: 'all-shared', minCoverage: 2 }).totalRows).toBe(2);
    expect(getComparisonPage(comparison, { mode: 'all-shared', minRaters: 1 }).totalRows).toBe(3);
    expect(getComparisonPage(comparison, { mode: 'all-shared', minRaters: 2, pageSize: 1, page: 2 }).rows[0]?.key).toBe(
      'collection:z',
    );
  });

  it('sorts with stable title/identity ties and keeps nulls after real zeros in either direction', () => {
    const comparison = fixture();
    const keys = (options: ComparisonPageOptions) =>
      getComparisonPage(comparison, { mode: 'all-shared', ...options }).rows.map(({ key }) => key);
    expect(keys({})).toEqual(['collection:b', 'collection:c', 'collection:a', 'collection:z']);
    expect(keys({ sort: { by: 'title', direction: 'desc' } })).toEqual([
      'collection:z',
      'collection:a',
      'collection:c',
      'collection:b',
    ]);
    expect(keys({ sort: { by: 'mean-score' } })).toEqual([
      'collection:z',
      'collection:b',
      'collection:c',
      'collection:a',
    ]);
    expect(keys({ sort: { by: 'mean-score', direction: 'desc' } })).toEqual([
      'collection:c',
      'collection:b',
      'collection:z',
      'collection:a',
    ]);
    expect(keys({ sort: { by: 'position', participantId: 'a' } })).toEqual([
      'collection:b',
      'collection:z',
      'collection:a',
      'collection:c',
    ]);
    expect(keys({ sort: { by: 'position', participantId: 'a', direction: 'desc' } })).toEqual([
      'collection:a',
      'collection:z',
      'collection:b',
      'collection:c',
    ]);
    expect(keys({ sort: { by: 'score', participantId: 'a' } })).toEqual([
      'collection:z',
      'collection:b',
      'collection:c',
      'collection:a',
    ]);
    expect(keys({ sort: { by: 'score-spread', direction: 'desc' } })).toEqual([
      'collection:b',
      'collection:z',
      'collection:c',
      'collection:a',
    ]);
    expect(keys({ sort: { by: 'score-difference', direction: 'desc' } })).toEqual([
      'collection:b',
      'collection:z',
      'collection:c',
      'collection:a',
    ]);
    expect(keys({ sort: { by: 'coverage', direction: 'desc' } })).toEqual([
      'collection:b',
      'collection:z',
      'collection:c',
      'collection:a',
    ]);
    expect(keys({ sort: { by: 'rater-count' } })).toEqual([
      'collection:a',
      'collection:c',
      'collection:b',
      'collection:z',
    ]);
  });

  it.each([
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: NaN },
    { page: Infinity },
    { pageSize: 0 },
    { pageSize: 26 },
    { pageSize: 1.5 },
    { pageSize: null },
    { pageSize: NaN },
    { minCoverage: 0 },
    { minCoverage: 3 },
    { minRaters: -1 },
    { minRaters: 3 },
    { minRaters: NaN },
    { mode: 'all' },
    { query: null },
    { sort: { by: 'random' } },
    { sort: { by: 'title', direction: 'up' } },
    { sort: { by: 'position' } },
    { sort: { by: 'score', participantId: 'missing' } },
    { sort: { by: 'title', participantId: 'a' } },
    { sort: {} },
    { sort: null },
  ])('rejects invalid page, filter or sort options %#', (options) => {
    expect(() => getComparisonPage(fixture(), options as ComparisonPageOptions)).toThrow(
      FriendComparisonValidationError,
    );
  });
});

describe('private-list scale with bounded friend intersections', () => {
  it('accepts 10,000 local rows and five 200-row friends, producing 15 bounded pair summaries', () => {
    const self = Array.from({ length: 10_000 }, (_, index) =>
      sourced('manual', String(index + 1), index + 1, index % 11),
    );
    const friends = Array.from({ length: 5 }, (_, person) =>
      ready(
        `friend-${person}`,
        self.slice(-200).map((entry, index) => ({ ...entry, position: index + 1, score: (index + person) % 11 })),
      ),
    );
    const comparison = compareFriendRankings([ready('self', self, 'self'), ...friends]);
    expect(comparison.cohort).toMatchObject({ participantCount: 6, availableParticipantCount: 6, incomplete: false });
    expect(comparison.rows['all-shared']).toHaveLength(10_000);
    expect(comparison.rows['common-ranked']).toHaveLength(200);
    expect(comparison.summary).toMatchObject({
      availableGameCount: 10_000,
      sharedGameCount: 200,
      jointlyRatedCount: 200,
    });
    expect(comparison.summary.pairs).toHaveLength(15);
    for (const pair of comparison.summary.pairs) {
      expect(pair).toMatchObject({ incomplete: false, sharedGameCount: 200, jointlyRatedCount: 200 });
      expect(pair.meanAbsoluteScoreGap).not.toBeNull();
    }
    expect(row(comparison, 'manual:10000').cells.map(({ position }) => position)).toEqual([
      10_000, 200, 200, 200, 200, 200,
    ]);
    expect(row(comparison, 'manual:1')).toMatchObject({ coverage: 1, raterCount: 1, meanScore: 0, scoreSpread: null });
    expect(getComparisonPage(comparison, { mode: 'all-shared' }).rows).toHaveLength(25);
    expect(getComparisonPage(comparison).rows).toHaveLength(25);
  });
});
