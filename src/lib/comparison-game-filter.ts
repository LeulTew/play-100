import type { LibraryScope } from './cloud-types';
import { scopeUid } from './cloud-types';
import { emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import type { LibraryRecord } from './personal-types';

export const COMPARISON_GAMES_KEY = 'play100.comparison-games.v1';
export const COMPARISON_GAMES_EVENT = 'play100:comparison-games';
export interface ComparisonGameFilter {
  version: 1;
  scope: LibraryScope;
  records: LibraryRecord[];
}

export function createComparisonGameFilter(
  scope: LibraryScope,
  records: readonly LibraryRecord[],
): ComparisonGameFilter {
  scopeUid(scope);
  if (!Array.isArray(records) || records.length < 1 || records.length > 6)
    throw new Error('Choose between one and six games for comparison.');
  const selected: Record<string, unknown> = Object.create(null);
  const order: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || typeof record.id !== 'string' || Object.hasOwn(selected, record.id))
      throw new Error('Choose distinct game identities for comparison.');
    selected[record.id] = record;
    order.push(record.id);
  }
  const parsed = parsePersonalLibrary({ ...emptyPersonalLibrary(), records: selected }).records;
  return { version: 1, scope, records: order.map((id) => parsed[id]!) };
}

export function parseComparisonGameFilter(value: unknown, scope: LibraryScope): ComparisonGameFilter | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The saved comparison game filter is invalid.');
  const row = value as Record<string, unknown>;
  if (row.scope !== scope) return null;
  if (Object.keys(row).sort().join() !== 'records,scope,version' || row.version !== 1 || !Array.isArray(row.records)) {
    throw new Error('The saved comparison game filter is unsupported.');
  }
  return createComparisonGameFilter(scope, row.records);
}

export function readComparisonGameFilter(scope: LibraryScope): {
  value: ComparisonGameFilter | null;
  warning: string | null;
} {
  if (scope === 'guest') return { value: null, warning: null };
  try {
    const stored = history.state?.play100ComparisonGames;
    if (
      stored &&
      stored.scope === scope &&
      stored.version === 1 &&
      stored.cleared === true &&
      Object.keys(stored).sort().join() === 'cleared,scope,version'
    )
      return { value: null, warning: null };
    const prior = parseComparisonGameFilter(stored, scope);
    if (prior) return { value: prior, warning: null };
    const raw = sessionStorage.getItem(COMPARISON_GAMES_KEY);
    if (raw === null) return { value: null, warning: null };
    if (raw.length > 12000) throw new Error('The saved comparison game filter is too large.');
    return { value: parseComparisonGameFilter(JSON.parse(raw), scope), warning: null };
  } catch (cause) {
    console.warn('Comparison games could not be restored in this tab.', cause);
    return {
      value: null,
      warning: 'The comparison game filter could not be restored. Pin the games again; your library is unchanged.',
    };
  }
}

export function rememberComparisonGameFilter(filter: ComparisonGameFilter): string | null {
  const value = createComparisonGameFilter(filter.scope, filter.records);
  if (location.pathname !== '/compare') throw new Error('Open comparisons before applying its private game filter.');
  history.replaceState({ ...history.state, play100ComparisonGames: value }, '', location.href);
  let warning: string | null = null;
  try {
    sessionStorage.setItem(COMPARISON_GAMES_KEY, JSON.stringify(value));
  } catch (cause) {
    console.warn('Comparison games remain in this history entry, but tab storage is unavailable.', cause);
    warning = 'This game filter is remembered only in the current comparison history.';
  }
  window.dispatchEvent(new Event(COMPARISON_GAMES_EVENT));
  return warning;
}

export function clearComparisonGameFilter(scope: LibraryScope): string | null {
  if (location.pathname === '/compare' || history.state?.play100ComparisonGames?.scope === scope) {
    history.replaceState(
      { ...history.state, play100ComparisonGames: { version: 1, scope, cleared: true } },
      '',
      location.href,
    );
  }
  let warning: string | null = null;
  try {
    const raw = sessionStorage.getItem(COMPARISON_GAMES_KEY);
    if (raw && JSON.parse(raw)?.scope === scope) sessionStorage.removeItem(COMPARISON_GAMES_KEY);
  } catch (cause) {
    console.warn('The comparison game filter could not be cleared from tab storage.', cause);
    warning =
      'This comparison is no longer filtered. Its old game filter may return in a new visit because tab storage could not be cleared.';
  }
  window.dispatchEvent(new Event(COMPARISON_GAMES_EVENT));
  return warning;
}
