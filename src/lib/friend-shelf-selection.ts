import type { LibraryScope } from './cloud-types';
import { shelfSelection } from './friend-shelf-types';

export interface FriendShelfJournal {
  update(
    scope: LibraryScope,
    revision: number,
    selected: readonly string[],
    explicitThroughRevision?: number,
    initialStateRevision?: number,
  ): Promise<void>;
  pending(scope: LibraryScope, stateRevision: number): Promise<ReadonlySet<string>>;
}
export interface ShelfSelectionCache {
  version: 1;
  revision: number;
  observedStateRevision: number;
  selected: string[];
  removed: Record<string, number>;
}
export interface ShelfReviewMarker {
  version: 1;
  blocked: true;
  changedAt: number;
}
function reviewRevision(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return row.version === 1 &&
    row.blocked === true &&
    revision(row.changedAt) &&
    Object.keys(row).sort().join() === 'blocked,changedAt,version'
    ? row.changedAt
    : null;
}
export const friendShelfSelectionKey = (scope: LibraryScope): string => `friends-shelf-selection:v1:${scope}`;
function invalid(): never {
  throw new Error(
    'Shared games need a fresh selection review after a library change in an older tab. Private saving is unaffected.',
  );
}
function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function parseShelfSelectionCache(value: unknown): ShelfSelectionCache | null {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join() !== 'observedStateRevision,removed,revision,selected,version' ||
    row.version !== 1 ||
    !revision(row.revision) ||
    !revision(row.observedStateRevision) ||
    !row.removed ||
    typeof row.removed !== 'object' ||
    Array.isArray(row.removed)
  )
    invalid();
  const selected = shelfSelection(row.selected);
  const removed = Object.entries(row.removed);
  if (removed.length > 200 || removed.some(([id, at]) => !selected.includes(id) || !revision(at))) invalid();
  return {
    version: 1,
    revision: row.revision,
    observedStateRevision: row.observedStateRevision,
    selected,
    removed: Object.fromEntries(removed) as Record<string, number>,
  };
}
export function rememberShelfSelection(
  value: unknown,
  settingsRevision: number,
  ids: readonly string[],
  initialStateRevision: number,
  explicitThroughRevision?: number,
): ShelfSelectionCache {
  if (
    !revision(settingsRevision) ||
    !revision(initialStateRevision) ||
    (explicitThroughRevision !== undefined && !revision(explicitThroughRevision))
  )
    invalid();
  const unreviewed = reviewRevision(value);
  if (unreviewed !== null && (explicitThroughRevision === undefined || explicitThroughRevision < unreviewed)) invalid();
  let current: ShelfSelectionCache | null;
  try {
    current = parseShelfSelectionCache(value);
  } catch (cause) {
    if (explicitThroughRevision === undefined) throw cause;
    current = null;
  }
  if (current && settingsRevision < current.revision) return current;
  const selected = shelfSelection(ids);
  return {
    version: 1,
    revision: settingsRevision,
    selected,
    observedStateRevision: Math.max(
      current?.observedStateRevision ?? initialStateRevision,
      explicitThroughRevision ?? 0,
    ),
    removed: Object.fromEntries(
      Object.entries(current?.removed ?? {}).filter(
        ([id, at]) => selected.includes(id) && (explicitThroughRevision === undefined || at > explicitThroughRevision),
      ),
    ),
  };
}
export function applyShelfRemovals(
  value: ShelfSelectionCache,
  removedIds: readonly string[],
  previousRevision: number,
  nextRevision: number,
): ShelfSelectionCache;
export function applyShelfRemovals(
  value: unknown,
  removedIds: readonly string[],
  previousRevision: number,
  nextRevision: number,
): ShelfSelectionCache | ShelfReviewMarker | null;
export function applyShelfRemovals(
  value: unknown,
  removedIds: readonly string[],
  previousRevision: number,
  nextRevision: number,
): ShelfSelectionCache | ShelfReviewMarker | null {
  if (!revision(previousRevision) || !revision(nextRevision) || nextRevision <= previousRevision) invalid();
  const unreviewed = reviewRevision(value);
  if (unreviewed !== null)
    return { version: 1, blocked: true, changedAt: removedIds.length ? nextRevision : unreviewed };
  const current = parseShelfSelectionCache(value);
  if (!current) return removedIds.length ? { version: 1, blocked: true, changedAt: nextRevision } : null;
  const removed = { ...current.removed };
  for (const id of removedIds) if (current.selected.includes(id)) removed[id] = nextRevision;
  return {
    ...current,
    removed,
    observedStateRevision:
      current.observedStateRevision === previousRevision ? nextRevision : current.observedStateRevision,
  };
}
export function pendingShelfRemovals(value: unknown, stateRevision: number): ReadonlySet<string> {
  const current = parseShelfSelectionCache(value);
  if (!current || !revision(stateRevision) || current.observedStateRevision !== stateRevision) invalid();
  return new Set(Object.keys(current.removed));
}
