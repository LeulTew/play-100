import type { ComparisonMode } from './friend-comparison';

export const FRIEND_COMPARISON_KEY = 'play100.friend-comparison.v1';
export interface FriendComparisonView {
  version: 1; scope: string; selected: string[]; mode: ComparisonMode; query: string; page: number; groupId: string | null;
}
export function comparisonScope(project: string, uid: string): string {
  if (!/^[a-z0-9-]{1,100}$/.test(project) || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('The comparison account is invalid.');
  return `${project}:${uid}`;
}
export function initialComparison(scope: string, uid: string, peers: string[] = []): FriendComparisonView {
  const value = { version: 1, scope, selected: [uid, ...peers], mode: 'common-ranked', query: '', page: 1, groupId: null };
  const parsed = parseComparisonView(value, scope);
  if (!parsed || peers.includes(uid)) throw new Error('Choose up to five different friends.');
  return parsed;
}
export function parseComparisonView(value: unknown, scope: string): FriendComparisonView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join() !== 'groupId,mode,page,query,scope,selected,version' ||
    row.version !== 1 || row.scope !== scope || !Array.isArray(row.selected) || row.selected.length > 6 ||
    row.selected.some((uid: unknown) => typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) ||
    new Set(row.selected).size !== row.selected.length ||
    row.mode !== 'common-ranked' && row.mode !== 'all-shared' ||
    typeof row.query !== 'string' || row.query.length > 160 ||
    typeof row.page !== 'number' || !Number.isSafeInteger(row.page) || row.page < 1 || row.page > 10000 ||
    row.groupId !== null && (typeof row.groupId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.groupId))) return null;
  return { version: 1, scope, selected: [...row.selected], mode: row.mode, query: row.query, page: row.page, groupId: row.groupId };
}
export function readComparisonView(scope: string): FriendComparisonView | null {
  const fromHistory = parseComparisonView(history.state?.play100Compare, scope);
  if (fromHistory) return fromHistory;
  try {
    const raw = sessionStorage.getItem(FRIEND_COMPARISON_KEY);
    if (raw === null) return null;
    if (raw.length > 2048) throw new Error('Comparison state is too large.');
    const parsed: unknown = JSON.parse(raw);
    const result = parseComparisonView(parsed, scope);
    if (!result && parsed && typeof parsed === 'object' && 'scope' in parsed && parsed.scope === scope) {
      console.warn('This tab had an invalid comparison selection. Choose the people again.');
      sessionStorage.removeItem(FRIEND_COMPARISON_KEY);
    }
    return result;
  } catch (cause) { console.warn('The comparison selection could not be restored in this tab.', cause); return null; }
}
export function rememberComparisonView(value: FriendComparisonView, attachToHistory = location.pathname === '/compare'): void {
  if (!parseComparisonView(value, value.scope)) throw new Error('The comparison selection is invalid.');
  if (attachToHistory) history.replaceState({ ...history.state, play100Compare: value }, '', location.href);
  try { sessionStorage.setItem(FRIEND_COMPARISON_KEY, JSON.stringify(value)); }
  catch (cause) { console.warn('This tab cannot remember comparisons between pages. The current comparison remains in browser history.', cause); }
}
export function clearComparisonView(scope: string): void {
  if (history.state?.play100Compare?.scope === scope) {
    const next = { ...history.state }; delete next.play100Compare;
    history.replaceState(next, '', location.href);
  }
  try {
    const raw = sessionStorage.getItem(FRIEND_COMPARISON_KEY);
    if (raw && JSON.parse(raw)?.scope === scope) sessionStorage.removeItem(FRIEND_COMPARISON_KEY);
  } catch (cause) { console.warn('The previous comparison preference could not be cleared. It will not be used by another account.', cause); }
}
