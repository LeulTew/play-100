import { friendSelectionStorageTransaction } from './personal-db';
import type { LibraryScope } from './cloud-types';

interface SelectionCache {
  version: 1;
  revision: number;
  observedStateRevision: number;
  selected: string[];
  removed: Record<string, number>;
}
function invalid(message: string): never {
  const error = new Error(message);
  error.name = 'PersonalLibraryFriendSelectionError';
  throw error;
}
function parse(value: unknown): SelectionCache | null {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid('The pending friends selection is unreadable.');
  const row = value as Record<string, unknown>;
  const selected = row.selected;
  if (
    row.version !== 1 ||
    typeof row.revision !== 'number' ||
    !Number.isSafeInteger(row.revision) ||
    typeof row.observedStateRevision !== 'number' ||
    !Number.isSafeInteger(row.observedStateRevision) ||
    row.observedStateRevision < 0 ||
    !Array.isArray(row.selected) ||
    row.selected.length > 200 ||
    !row.selected.every(
      (id): id is string => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(id),
    ) ||
    !row.removed ||
    typeof row.removed !== 'object' ||
    Array.isArray(row.removed) ||
    Object.keys(row.removed).length > 200 ||
    !Object.entries(row.removed).every(
      ([id, revision]) =>
        Array.isArray(selected) &&
        selected.includes(id) &&
        typeof revision === 'number' &&
        Number.isSafeInteger(revision),
    )
  )
    return invalid('The pending friends selection is invalid. Review the selection before sharing again.');
  return {
    version: 1,
    revision: row.revision,
    observedStateRevision: row.observedStateRevision,
    selected: row.selected,
    removed: row.removed as Record<string, number>,
  };
}
export function updateFriendSelectionCache(
  scope: LibraryScope,
  revision: number,
  selected: readonly string[],
  explicitThroughRevision?: number,
  initialStateRevision = 0,
): Promise<void> {
  return friendSelectionStorageTransaction(scope, (value, store) => {
    let current: SelectionCache | null;
    try {
      current = parse(value);
    } catch (cause) {
      if (explicitThroughRevision === undefined) throw cause;
      current = null;
    }
    if (current && revision < current.revision) return;
    if (selected.length > 200 || new Set(selected).size !== selected.length)
      throw new Error('The friends selection is invalid.');
    const removed = Object.fromEntries(
      Object.entries(current?.removed ?? {}).filter(
        ([id, changedAt]) =>
          selected.includes(id) && (explicitThroughRevision === undefined || changedAt > explicitThroughRevision),
      ),
    );
    store.put(
      {
        version: 1,
        revision,
        observedStateRevision: Math.max(
          explicitThroughRevision ?? 0,
          current?.observedStateRevision ?? initialStateRevision,
        ),
        selected: [...selected],
        removed,
      },
      `friends-selection:v1:${scope}`,
    );
  });
}
export function pendingFriendRemovals(
  scope: LibraryScope,
  currentStateRevision?: number,
): Promise<ReadonlySet<string>> {
  return friendSelectionStorageTransaction(scope, (value) => {
    const current = parse(value);
    if (current && currentStateRevision !== undefined && current.observedStateRevision !== currentStateRevision)
      return invalid(
        'This library changed in an older tab. Refresh that tab, then review friends sharing before updating it. Private saving is unaffected.',
      );
    return new Set(Object.keys(current?.removed ?? {}));
  });
}
export function recordFriendRemovals(
  store: IDBObjectStore,
  scope: LibraryScope,
  removedIds: string[],
  previousStateRevision: number,
  stateRevision: number,
): void {
  const key = `friends-selection:v1:${scope}`;
  const request = store.get(key);
  request.onsuccess = () => {
    try {
      const current = parse(request.result);
      if (!current) return;
      const selected = new Set(current.selected);
      const removed = { ...current.removed };
      for (const id of removedIds) if (selected.has(id)) removed[id] = stateRevision;
      store.put(
        {
          ...current,
          observedStateRevision:
            current.observedStateRevision === previousStateRevision ? stateRevision : current.observedStateRevision,
          removed,
        },
        key,
      );
    } catch (cause) {
      console.error(
        'Friends sharing needs a fresh selection before it can resume.',
        cause instanceof Error ? cause.message : 'Invalid selection.',
      );
      store.put({ version: 1, blocked: true }, key);
    }
  };
}
