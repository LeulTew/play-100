import { emptyPersonalLibrary, parsePersonalLibrary } from '../src/lib/personal-library';
import { MAX_LIBRARY_RECORDS } from '../src/lib/personal-types';
import type { LibraryRecord, PersonalLibraryState } from '../src/lib/personal-types';

export function rankingFixture(total = 120): PersonalLibraryState {
  if (!Number.isInteger(total) || total < 1 || total > MAX_LIBRARY_RECORDS) {
    throw new RangeError('Synthetic ranking size is outside the supported library bound.');
  }
  const records: LibraryRecord[] = Array.from({ length: total }, (_, index) => {
    const sourceId = `perf-ranking-${String(index + 1).padStart(5, '0')}`;
    return {
      id: `manual:${sourceId}`,
      source: 'manual',
      sourceId,
      title: `Synthetic ranked game ${String(index + 1).padStart(5, '0')}`,
      year: 2020,
      studio: null,
      genre: null,
      collectionRank: null,
      sourceUrl: null,
    };
  });
  return parsePersonalLibrary({
    ...emptyPersonalLibrary(),
    revision: 1,
    motion: 'lite',
    records: Object.fromEntries(records.map((record) => [record.id, record])),
    ranking: records.map((record, index) => ({
      id: record.id,
      score: 7,
      note: `Synthetic private opinion ${index + 1}; not real account data.`,
      manualPosition: index + 1,
    })),
  });
}
