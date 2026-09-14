import type { PersonalRanking } from './personal-types';

export function orderByRating(entries: readonly PersonalRanking[]): PersonalRanking[] {
  const fixed = new Map<number, PersonalRanking>();
  const automatic: { entry: PersonalRanking; index: number }[] = [];
  entries.forEach((entry, index) => {
    if (entry.manualPosition === null) automatic.push({ entry, index });
    else fixed.set(entry.manualPosition - 1, entry);
  });
  automatic.sort((left, right) => {
    if (left.entry.score === null) return right.entry.score === null ? left.index - right.index : 1;
    if (right.entry.score === null) return -1;
    return right.entry.score - left.entry.score || left.index - right.index;
  });
  let next = 0;
  return entries.map((_, index) => {
    const entry = fixed.get(index) ?? automatic[next++]?.entry;
    if (!entry) throw new Error('The personal ranking contains inconsistent manual positions.');
    return entry;
  });
}

export function retainManualPositions(entries: PersonalRanking[], movedId?: string): void {
  entries.forEach((entry, index) => {
    if (entry.id === movedId || entry.manualPosition !== null) entry.manualPosition = index + 1;
  });
}
