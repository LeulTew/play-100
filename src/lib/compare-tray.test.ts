import { describe, expect, it, vi } from 'vitest';
import { compareTrayStorageKey, COMPARE_TRAY_MAX_BYTES, createCompareDragSession, createCompareTrayStore, parseCompareTray, serializeCompareTray } from './compare-tray';
import type { CompareTrayStorage } from './compare-tray';
import { emptyPersonalLibrary } from './personal-library';
import type { LibraryRecord } from './personal-types';

const alice = 'account:demo-play100:alice';
const bob = 'account:demo-play100:bob';
const game = (id: number): LibraryRecord => ({
  id: `wikidata:Q${id}`, source: 'wikidata', sourceId: `Q${id}`, title: `Game ${id}`,
  year: 2020, studio: null, genre: null, sourceUrl: `https://www.wikidata.org/wiki/Q${id}`, collectionRank: null,
});
function memory() {
  const data = new Map<string, string>();
  const storage: CompareTrayStorage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
  };
  return { data, storage };
}
const saved = (items: unknown, scope = 'guest') => JSON.stringify({ version: 1, scope, items });

describe('Compare tray reference validation', () => {
  it('dismisses limit feedback without changing pins or storage and announces the next failed attempt', () => {
    const { storage } = memory();
    let current = true;
    const store = createCompareTrayStore('guest', () => storage, () => current);
    for (let id = 1; id <= 6; id += 1) expect(store.pin(game(id))).toBe(true);
    expect(store.pin(game(7))).toBe(false);
    const before = store.getSnapshot();
    const writes = vi.mocked(storage.setItem).mock.calls.length;
    store.dismissError();
    expect(store.getSnapshot()).toEqual({ ...before, error: null, status: '' });
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
    expect(store.pin(game(7))).toBe(false);
    expect(store.getSnapshot().status).toMatch(/six games/);
    current = false;
    store.dismissError();
    expect(store.getSnapshot().error).toMatch(/six games/);
  });
  it('uses bounded indexed data slots, never a custom Array iterator or accessor', () => {
    const input = [game(1)];
    const iterate = vi.fn(() => { throw new Error('Iterator must never run'); });
    Object.defineProperty(input, Symbol.iterator, { value: iterate });
    expect(parseCompareTray(serializeCompareTray('guest', input), 'guest')).toEqual([game(1)]);
    expect(iterate).not.toHaveBeenCalled();
    const accessor = vi.fn(() => game(2));
    Object.defineProperty(input, '0', { get: accessor });
    expect(() => serializeCompareTray('guest', input)).toThrow(/plain data/);
    expect(accessor).not.toHaveBeenCalled();
  });
  it('round trips metadata only, preserving six-game order', () => {
    const items = [6, 2, 1, 5, 4, 3].map(game);
    expect(parseCompareTray(serializeCompareTray(alice, items), alice)).toEqual(items);
    expect(() => serializeCompareTray(alice, [...items, game(7)])).toThrow(/six/);
  });

  describe('optional Compare drag sessions', () => {
    const token = '00000000-0000-4000-8000-000000000001';
    const nextToken = '00000000-0000-4000-8000-000000000002';
    it('holds validated metadata only in memory and transfers an opaque single-use token', () => {
      const { storage } = memory();
      const store = createCompareTrayStore(alice, () => storage);
      const drag = createCompareDragSession(alice, store, () => true, () => token);
      const record = game(1);
      const transfer = drag.beginDrag(record);
      expect(transfer).toBe(token);
      expect(transfer).not.toContain(alice);
      expect(transfer).not.toContain(record.title);
      expect(store.getSnapshot()).toMatchObject({ items: [], dragging: true });
      expect(storage.setItem).not.toHaveBeenCalled();
      record.title = 'Mutated after drag start';
      expect(drag.dropGame(token)).toBe(true);
      expect(store.getSnapshot()).toMatchObject({ items: [game(1)], dragging: false });
      expect(drag.dropGame(token)).toBe(false);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
    });
    it('rejects foreign, stale and oversized drag tokens, and cancellation never pins', () => {
      const { storage } = memory();
      const store = createCompareTrayStore('guest', () => storage);
      const drag = createCompareDragSession('guest', store, () => true, () => token);
      for (const other of [nextToken, 'x'.repeat(100_000), JSON.stringify(game(1))]) {
        drag.beginDrag(game(1));
        expect(drag.dropGame(other)).toBe(false);
        expect(store.getSnapshot().error).toBe('This drag has expired or belongs to another tab. Use Pin for comparison instead.');
      }
      drag.beginDrag(game(1));
      drag.cancelDrag();
      expect(drag.dropGame(token)).toBe(false);
      expect(store.getSnapshot().items).toEqual([]);
      expect(storage.setItem).not.toHaveBeenCalled();
    });
    it('supersedes an old drag and reuses pin deduplication and six-game bounds on drop', () => {
      const { storage } = memory();
      const store = createCompareTrayStore('guest', () => storage);
      const tokens = vi.fn().mockReturnValueOnce(token).mockReturnValue(nextToken);
      const drag = createCompareDragSession('guest', store, () => true, tokens);
      drag.beginDrag(game(1));
      drag.beginDrag(game(2));
      expect(drag.dropGame(token)).toBe(false);
      for (let id = 1; id <= 6; id += 1) store.pin(game(id));
      drag.beginDrag(game(2));
      expect(drag.dropGame(nextToken)).toBe(true);
      drag.beginDrag(game(7));
      expect(drag.dropGame(nextToken)).toBe(false);
      expect(store.getSnapshot().items).toHaveLength(6);
      expect(store.getSnapshot().error).toMatch(/six games/);
    });
    it('invalidates old drags and callbacks across A to B to A using unique store leases', () => {
      const { storage } = memory();
      const lease = {};
      let currentLease = lease;
      const isCurrent = () => currentLease === lease;
      const store = createCompareTrayStore(alice, () => storage, isCurrent);
      const drag = createCompareDragSession(alice, store, isCurrent, () => token);
      drag.beginDrag(game(1));
      currentLease = {};
      createCompareTrayStore(bob, () => storage);
      currentLease = {};
      const fresh = createCompareTrayStore(alice, () => storage);
      expect(drag.dropGame(token)).toBe(false);
      expect(drag.beginDrag(game(2))).toBe(null);
      expect(store.pin(game(3))).toBe(false);
      expect(fresh.getSnapshot().items).toEqual([]);
      expect(storage.setItem).not.toHaveBeenCalled();
    });
    it('validates before starting and never transfers a private field or an arbitrary ID', () => {
      const { storage } = memory();
      const store = createCompareTrayStore('guest', () => storage);
      const drag = createCompareDragSession('guest', store, () => true, () => token);
      const privateRecord = { ...game(1), note: 'Must not be transferred' };
      expect(drag.beginDrag(privateRecord)).toBe(null);
      expect(drag.beginDrag({ ...game(1), id: 'not-the-source-id' })).toBe(null);
      expect(store.getSnapshot()).toMatchObject({ dragging: false, items: [] });
      expect(storage.setItem).not.toHaveBeenCalled();
    });
  });
  it('rejects duplicates, oversized bytes and unsupported envelopes without partial recovery', () => {
    expect(() => parseCompareTray(saved([game(1), game(1)]), 'guest')).toThrow(/unique/);
    expect(() => parseCompareTray(' '.repeat(COMPARE_TRAY_MAX_BYTES + 1), 'guest')).toThrow(/limit/);
    expect(() => parseCompareTray('é'.repeat(COMPARE_TRAY_MAX_BYTES / 2 + 1), 'guest')).toThrow(/limit/);
    expect(() => parseCompareTray(JSON.stringify({ version: 2, scope: 'guest', items: [] }), 'guest')).toThrow(/version/);
    expect(() => parseCompareTray(JSON.stringify({ version: 1, scope: 'guest', items: [], note: 'private' }), 'guest')).toThrow(/version/);
    expect(() => parseCompareTray(saved([game(1), { ...game(2), year: 1 }]), 'guest')).toThrow();
  });
  it('rejects extra opinions, source identity mismatches, unsafe links and prototype keys', () => {
    for (const record of [
      { ...game(1), note: 'private' }, { ...game(1), score: 5 }, { ...game(1), played: true },
      { ...game(1), id: 'different-source' }, { ...game(1), sourceUrl: 'javascript:alert(1)' },
      { ...game(1), sourceUrl: `https://www.wikidata.org/${'x'.repeat(2048)}` },
      { ...game(1), id: '__proto__' },
    ]) expect(() => parseCompareTray(saved([record]), 'guest')).toThrow();
  });
  it('keeps exact IDs distinct even when titles match', () => {
    const first = game(1);
    const second = { ...game(2), title: first.title };
    expect(parseCompareTray(saved([first, second]), 'guest')).toHaveLength(2);
  });
  it('enforces the serialized UTF-8 byte limit even for otherwise valid metadata', () => {
    const items = [1, 2, 3, 4, 5, 6].map((id) => ({
      ...game(id), title: 'é'.repeat(200), studio: 'é'.repeat(200), genre: 'é'.repeat(200),
      sourceUrl: `https://www.wikidata.org/${'é'.repeat(2000)}`,
    }));
    expect(() => serializeCompareTray('guest', [items[0]!])).not.toThrow();
    expect(() => serializeCompareTray('guest', items)).toThrow(/storage limit/);
  });
  it('isolates guest, project and account scopes', () => {
    expect(compareTrayStorageKey(alice)).not.toBe(compareTrayStorageKey(bob));
    expect(compareTrayStorageKey(alice)).not.toBe(compareTrayStorageKey('account:play100-online-48823b32:alice'));
    for (const scope of ['', 'account:alice', 'account:demo-play100:', 'account:demo-play100:../alice', 'guest:alice']) {
      expect(() => compareTrayStorageKey(scope)).toThrow(/scope/);
    }
    expect(() => parseCompareTray(saved([game(1)], alice), bob)).toThrow(/scope/);
    expect(() => parseCompareTray(saved([game(1)]), alice)).toThrow(/scope/);
  });
});

describe('Compare tray scoped store', () => {
  it('pins in order, deduplicates idempotently, caps at six and removes without library side effects', () => {
    const { storage, data } = memory();
    const library = emptyPersonalLibrary();
    const before = structuredClone(library);
    const store = createCompareTrayStore('guest', () => storage);
    for (const id of [5, 1, 6, 2, 4, 3]) expect(store.pin(game(id))).toBe(true);
    expect(store.pin(game(1))).toBe(true);
    expect(store.pin(game(7))).toBe(false);
    expect(store.getSnapshot().status).toMatch(/six games/);
    expect(store.getSnapshot().items.map((item) => item.sourceId)).toEqual(['Q5', 'Q1', 'Q6', 'Q2', 'Q4', 'Q3']);
    expect(store.unpin(game(6).id)).toBe(true);
    expect(store.pin(game(7))).toBe(true);
    expect(store.getSnapshot().items.at(-1)?.id).toBe(game(7).id);
    expect(library).toEqual(before);
    expect([...data.keys()]).toEqual([compareTrayStorageKey('guest')]);
    expect(store.clear()).toBe(true);
    expect(store.getSnapshot().items).toEqual([]);
    expect(data.size).toBe(0);
  });
  it('restores on reload but never adopts guest pins on sign-in or another account', () => {
    const { storage } = memory();
    const guest = createCompareTrayStore('guest', () => storage);
    guest.pin(game(1));
    const own = createCompareTrayStore(alice, () => storage);
    expect(own.getSnapshot().items).toEqual([]);
    own.pin(game(2));
    expect(createCompareTrayStore(bob, () => storage).getSnapshot().items).toEqual([]);
    expect(createCompareTrayStore(alice, () => storage).getSnapshot().items).toEqual([game(2)]);
    expect(createCompareTrayStore('guest', () => storage).getSnapshot().items).toEqual([game(1)]);
  });
  it('makes obsolete callback references inert when the active scope changes', () => {
    const { storage } = memory();
    let scope = alice;
    const old = createCompareTrayStore(alice, () => storage, () => scope === alice);
    old.pin(game(1));
    const { pin, unpin, clear, reload } = old;
    const writes = vi.mocked(storage.setItem).mock.calls.length;
    scope = bob;
    expect(pin(game(2))).toBe(false);
    expect(unpin(game(1).id)).toBe(false);
    expect(clear()).toBe(false);
    reload();
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
  it('leaves corrupt storage untouched until the explicit clear/reset action', () => {
    const { storage, data } = memory();
    const key = compareTrayStorageKey(alice);
    data.set(key, '{bad data');
    const store = createCompareTrayStore(alice, () => storage);
    expect(store.getSnapshot()).toMatchObject({ items: [], persistent: false, warning: expect.stringMatching(/left untouched/) });
    expect(store.pin(game(1))).toBe(true);
    expect(data.get(key)).toBe('{bad data');
    expect(storage.setItem).not.toHaveBeenCalled();
    store.clear();
    expect(data.has(key)).toBe(false);
    store.pin(game(2));
    expect(store.getSnapshot().persistent).toBe(true);
  });
  it('reports denied reads, writes and clears truthfully, retaining usable temporary pins', () => {
    const { storage, data } = memory();
    const key = compareTrayStorageKey('guest');
    data.set(key, saved([game(1)]));
    vi.mocked(storage.getItem).mockImplementation(() => { throw new Error('denied'); });
    const denied = createCompareTrayStore('guest', () => storage);
    denied.pin(game(2));
    expect(denied.getSnapshot().warning).toMatch(/unavailable/);
    expect(data.get(key)).toBe(saved([game(1)]));
    vi.mocked(storage.getItem).mockImplementation((item) => data.get(item) ?? null);
    const store = createCompareTrayStore('guest', () => storage);
    vi.mocked(storage.setItem).mockImplementation(() => { throw new Error('quota'); });
    store.pin(game(2));
    expect(store.getSnapshot()).toMatchObject({ items: [game(1), game(2)], persistent: false, warning: expect.stringMatching(/tab only/) });
    vi.mocked(storage.removeItem).mockImplementation(() => { throw new Error('denied'); });
    store.clear();
    expect(store.getSnapshot()).toMatchObject({ items: [], persistent: false, warning: expect.stringMatching(/may return/) });
    expect(data.get(key)).toBe(saved([game(1)]));
  });
  it('freezes returned records and arrays so callers cannot bypass validation', () => {
    const { storage } = memory();
    const store = createCompareTrayStore('guest', () => storage);
    const record = game(1);
    store.pin(record);
    record.title = 'Changed externally';
    expect(store.getSnapshot().items[0]?.title).toBe('Game 1');
    expect(Object.isFrozen(store.getSnapshot().items)).toBe(true);
    expect(Object.isFrozen(store.getSnapshot().items[0])).toBe(true);
    expect(() => { const item = store.getSnapshot().items[0]; if (item) item.title = 'Oops'; }).toThrow();
  });
  it('reports rejected metadata visibly without changing existing pins or storage', () => {
    const { storage } = memory();
    const store = createCompareTrayStore('guest', () => storage);
    store.pin(game(1));
    const invalid = { ...game(2), note: 'Do not retain this private opinion' };
    expect(store.pin(invalid)).toBe(false);
    expect(store.getSnapshot().items).toEqual([game(1)]);
    expect(store.getSnapshot().error).toMatch(/unsupported fields/);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
  it('supports external updates only to its own scope and preserves good state on corruption', () => {
    const { storage, data } = memory();
    const store = createCompareTrayStore(alice, () => storage);
    const observer = vi.fn();
    const unsubscribe = store.subscribe(observer);
    data.set(compareTrayStorageKey(alice), saved([game(3)], alice));
    store.reload();
    expect(store.getSnapshot().items).toEqual([game(3)]);
    data.set(compareTrayStorageKey(alice), saved([game(4)], bob));
    store.reload();
    expect(store.getSnapshot().items).toEqual([game(3)]);
    expect(store.getSnapshot().warning).toMatch(/left untouched/);
    expect(observer).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.clear();
    expect(observer).toHaveBeenCalledTimes(2);
  });
});
