import { emptyPersonalLibrary, parsePersonalLibrary } from './personal-library';
import type { LibraryRecord } from './personal-types';
import { canonicalCatalogId } from './catalog-identity';

export const COMPARE_TRAY_LIMIT = 6;
export const COMPARE_TRAY_MAX_BYTES = 24_576;
export const COMPARE_DRAG_TYPE = 'application/x-play100-compare-game';
const encoder = new TextEncoder();

export interface CompareTraySnapshot {
  items: readonly LibraryRecord[];
  persistent: boolean;
  warning: string | null;
  error: string | null;
  status: string;
  dragging: boolean;
}

export type CompareTrayStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function compareTrayStorageKey(scope: string): string {
  if (scope !== 'guest' && !/^account:(?:play100-online-48823b32|demo-play100):[A-Za-z0-9_-]{1,128}$/.test(scope)) {
    throw new Error('The Compare tray account scope is invalid.');
  }
  return `play100:compare-tray:v1:${scope}`;
}

function records(value: unknown): LibraryRecord[] {
  if (!Array.isArray(value) || value.length > COMPARE_TRAY_LIMIT)
    throw new Error('Pin up to six games for comparison.');
  const input: Record<string, unknown> = Object.create(null);
  const ids: string[] = [];
  const length = value.length;
  for (let index = 0; index < length; index += 1) {
    const slot = Object.getOwnPropertyDescriptor(value, String(index));
    if (!slot || !('value' in slot)) throw new Error('Pinned games must contain plain data records.');
    const item: unknown = slot.value;
    if (typeof item !== 'object' || item === null) throw new Error('A pinned game is invalid.');
    const id: unknown = Object.getOwnPropertyDescriptor(item, 'id')?.value;
    if (typeof id !== 'string' || Object.hasOwn(input, id)) throw new Error('Pinned games must have unique game IDs.');
    input[id] = item;
    ids.push(id);
  }
  // Reuse the canonical metadata validator without reading or writing the personal library.
  const validated = parsePersonalLibrary({ ...emptyPersonalLibrary(), records: input }).records;
  return ids.map((id) => {
    const record = validated[id];
    if (
      !record ||
      record.id !== (record.source === 'collection' ? record.sourceId : `${record.source}:${record.sourceId}`)
    ) {
      throw new Error('A pinned game does not match its exact source ID.');
    }
    if (record.sourceUrl !== null && record.sourceUrl.length > 2_048)
      throw new Error('The pinned game source link is too long.');
    return Object.freeze(record);
  });
}

export function serializeCompareTray(scope: string, items: readonly LibraryRecord[]): string {
  compareTrayStorageKey(scope);
  const raw = JSON.stringify({ version: 1, scope, items: records(items) });
  if (encoder.encode(raw).byteLength > COMPARE_TRAY_MAX_BYTES)
    throw new Error('These game references exceed the Compare tray storage limit.');
  return raw;
}

export function parseCompareTray(raw: string, scope: string): LibraryRecord[] {
  compareTrayStorageKey(scope);
  if (raw.length > COMPARE_TRAY_MAX_BYTES || encoder.encode(raw).byteLength > COMPARE_TRAY_MAX_BYTES) {
    throw new Error('The saved Compare tray exceeds its storage limit.');
  }
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('The saved Compare tray is invalid.');
  const entry = value as Record<string, unknown>;
  if (
    Object.keys(entry).length !== 3 ||
    entry.version !== 1 ||
    entry.scope !== scope ||
    !Object.hasOwn(entry, 'items')
  ) {
    throw new Error('The saved Compare tray has an unsupported version or account scope.');
  }
  return records(entry.items);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The game could not be pinned.';
}

export function createCompareTrayStore(
  scope: string,
  getStorage: () => CompareTrayStorage,
  isCurrent: () => boolean = () => true,
) {
  const key = compareTrayStorageKey(scope);
  const listeners = new Set<() => void>();
  let protectedStorage = false;
  let snapshot: CompareTraySnapshot = {
    items: Object.freeze([]),
    persistent: true,
    warning: null,
    error: null,
    status: '',
    dragging: false,
  };
  const publish = (next: CompareTraySnapshot) => {
    snapshot = Object.freeze({ ...next, items: Object.freeze([...next.items]) });
    for (const listener of listeners) listener();
  };
  const reload = () => {
    if (!isCurrent()) return;
    let raw: string | null;
    try {
      raw = getStorage().getItem(key);
    } catch {
      protectedStorage = true;
      publish({
        ...snapshot,
        persistent: false,
        warning:
          'Compare tray storage is unavailable. Pins stay in this tab only; your saved tray has not been replaced.',
      });
      return;
    }
    try {
      const items = raw === null ? [] : parseCompareTray(raw, scope);
      protectedStorage = false;
      publish({ items, persistent: true, warning: null, error: null, status: '', dragging: snapshot.dragging });
    } catch {
      protectedStorage = true;
      publish({
        ...snapshot,
        persistent: false,
        warning:
          'The saved Compare tray could not be read. It has been left untouched. New pins are temporary; use Reset saved tray to replace it.',
      });
    }
  };
  const save = (items: readonly LibraryRecord[], status: string) => {
    let raw: string;
    try {
      raw = serializeCompareTray(scope, items);
    } catch (error) {
      publish({ ...snapshot, error: message(error), status: message(error) });
      return false;
    }
    if (!isCurrent()) return false;
    let warning = snapshot.warning;
    let persistent = false;
    if (!protectedStorage) {
      try {
        getStorage().setItem(key, raw);
        persistent = true;
        warning = null;
      } catch {
        warning =
          'Compare tray storage is unavailable. These pins stay in this tab only; retry by pinning again or keep this tab open.';
      }
    }
    publish({ items, persistent, warning, error: null, status, dragging: snapshot.dragging });
    return true;
  };
  reload();
  return {
    currentScope: scope,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reload,
    setDragging(dragging: boolean) {
      if (isCurrent()) publish({ ...snapshot, dragging });
    },
    reportError(error: string) {
      if (isCurrent()) publish({ ...snapshot, error, status: error });
    },
    dismissError() {
      if (isCurrent()) publish({ ...snapshot, error: null, status: '' });
    },
    pin(record: LibraryRecord): boolean {
      if (!isCurrent()) return false;
      let valid: LibraryRecord;
      try {
        const result = records([record])[0];
        if (!result) throw new Error('The game could not be pinned.');
        valid = result;
      } catch (error) {
        publish({ ...snapshot, error: message(error), status: message(error) });
        return false;
      }
      if (snapshot.items.some((item) => canonicalCatalogId(item.id) === canonicalCatalogId(valid.id))) {
        if (!snapshot.persistent && !protectedStorage) return save(snapshot.items, `${valid.title} is already pinned.`);
        publish({ ...snapshot, error: null, status: `${valid.title} is already pinned.` });
        return true;
      }
      if (snapshot.items.length >= COMPARE_TRAY_LIMIT) {
        const error = 'The Compare tray holds six games. Unpin one before adding another.';
        publish({ ...snapshot, error, status: error });
        return false;
      }
      return save(
        [...snapshot.items, valid],
        `${valid.title} pinned for comparison. ${snapshot.items.length + 1} of six games.`,
      );
    },
    unpin(id: string): boolean {
      if (!isCurrent()) return false;
      const record =
        snapshot.items.find((item) => item.id === id) ??
        snapshot.items.find((item) => canonicalCatalogId(item.id) === canonicalCatalogId(id));
      if (!record) return false;
      return save(
        snapshot.items.filter((item) => item.id !== record.id),
        `${record.title} unpinned from comparison.`,
      );
    },
    clear(): boolean {
      if (!isCurrent()) return false;
      let warning: string | null = null;
      let persistent = true;
      try {
        getStorage().removeItem(key);
        protectedStorage = false;
      } catch {
        persistent = false;
        warning =
          'The tray is empty in this tab, but its saved copy could not be cleared. It may return on reload. Allow storage and clear again.';
      }
      publish({
        items: [],
        persistent,
        warning,
        error: null,
        status: 'Compare tray cleared. Your library is unchanged.',
        dragging: false,
      });
      return true;
    },
  };
}

export type CompareTrayStore = ReturnType<typeof createCompareTrayStore>;

export function createCompareDragSession(
  scope: string,
  store: Pick<CompareTrayStore, 'pin' | 'setDragging' | 'reportError'>,
  isCurrent: () => boolean,
  createToken: () => string = () => crypto.randomUUID(),
) {
  compareTrayStorageKey(scope);
  let active: { token: string; record: LibraryRecord } | null = null;
  const cancelDrag = () => {
    active = null;
    if (isCurrent()) store.setDragging(false);
  };
  return {
    beginDrag(record: LibraryRecord): string | null {
      if (!isCurrent()) return null;
      cancelDrag();
      try {
        const valid = parseCompareTray(serializeCompareTray(scope, [record]), scope)[0];
        const token = createToken();
        if (!valid || !/^[a-f0-9-]{36}$/i.test(token))
          throw new Error('A safe drag could not be started. Use Pin for comparison instead.');
        active = { token, record: valid };
        store.setDragging(true);
        // Only an opaque one-use token crosses DataTransfer, never an account ID or game metadata.
        return token;
      } catch (error) {
        store.reportError(message(error));
        return null;
      }
    },
    cancelDrag,
    dropGame(token: string): boolean {
      if (!isCurrent()) {
        active = null;
        return false;
      }
      const pending = active;
      cancelDrag();
      if (!pending || token.length !== 36 || token !== pending.token) {
        store.reportError('This drag has expired or belongs to another tab. Use Pin for comparison instead.');
        return false;
      }
      return store.pin(pending.record);
    },
  };
}

export type CompareDragSession = ReturnType<typeof createCompareDragSession>;
