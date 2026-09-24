import { deleteApp, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { describe, expect, it, vi } from 'vitest';
import type { FriendBlock, FriendCursor, FriendGroup, FriendIdentity, FriendPage, FriendPair, FriendSettings } from '../lib/friend-types';
import { FriendStore } from './friend-store';

const identity = { uid: 'alpha', displayName: 'Alpha' } as unknown as FriendIdentity;
const settings = { enabled: true, revision: 3 } as unknown as FriendSettings;
const token = { after: 'opaque' } as unknown as FriendCursor;
const item = <T>(id: string) => ({ id }) as unknown as T;
type Read<T> = (cursor?: FriendCursor) => Promise<FriendPage<T>>;

async function withStore(run: (store: FriendStore) => Promise<void>) {
  const app = initializeApp({ projectId: 'demo-play100' }, crypto.randomUUID());
  try { await run(new FriendStore(getFirestore(app))); } finally { await deleteApp(app); }
}

// Serves fixed pages; each page cursor is accepted only by the page after it.
function pager<T>(values: T[][]) {
  const cursors = values.map((_, index) => ({ after: index }) as unknown as FriendCursor);
  return vi.fn(async (cursor?: FriendCursor): Promise<FriendPage<T>> => {
    const index = cursor === undefined ? 0 : cursors.indexOf(cursor) + 1;
    const page = values[index];
    if (!page || (index === 0 && cursor !== undefined)) throw new Error('Unexpected export cursor.');
    return { items: page, cursor: index < values.length - 1 ? cursors[index] : undefined };
  });
}

function install(store: FriendStore, relations: Read<FriendPair>, groups: Read<FriendGroup>, blocks: Read<FriendBlock>) {
  return {
    identity: vi.spyOn(store, 'identity').mockResolvedValue(identity),
    settings: vi.spyOn(store, 'settings').mockResolvedValue(settings),
    relations: vi.spyOn(store, 'listRelations').mockImplementation((_uid, _state, cursor) => relations(cursor)),
    groups: vi.spyOn(store, 'listGroups').mockImplementation((_uid, cursor) => groups(cursor)),
    blocks: vi.spyOn(store, 'listBlocks').mockImplementation((_uid, cursor) => blocks(cursor)),
  };
}

describe('account friend export', () => {
  it('reads identity and settings once and each collection only to its own last page', async () => {
    await withStore(async store => {
      const relations = pager<FriendPair>([[item('pair-1'), item('pair-2')], [item('pair-3')], [item('pair-4')]]);
      const groups = pager<FriendGroup>([[item('group-1')]]);
      const blocks = pager<FriendBlock>([[item('block-1')], [item('block-2')]]);
      const reads = install(store, relations, groups, blocks);
      const exported = await store.exportAll('alpha', () => true);
      expect(reads.identity).toHaveBeenCalledOnce();
      expect(reads.settings).toHaveBeenCalledOnce();
      expect(relations).toHaveBeenCalledTimes(3);
      expect(groups).toHaveBeenCalledTimes(1);
      expect(blocks).toHaveBeenCalledTimes(2);
      expect(groups.mock.calls).toEqual([[undefined]]);
      expect(exported).toEqual({
        identity, settings,
        relations: [item('pair-1'), item('pair-2'), item('pair-3'), item('pair-4')],
        groups: [item('group-1')],
        blocks: [item('block-1'), item('block-2')],
      });
    });
  });

  it('fails the whole export and stops paging the other collections when one page fails', async () => {
    await withStore(async store => {
      const relations = vi.fn(async (cursor?: FriendCursor): Promise<FriendPage<FriendPair>> => {
        if (cursor) throw new Error('Synthetic relations page failure');
        return { items: [item('pair-1')], cursor: token };
      });
      const blocks = vi.fn(async (): Promise<FriendPage<FriendBlock>> => ({ items: [item('block')], cursor: token }));
      install(store, relations, pager<FriendGroup>([[item('group-1')]]), blocks);
      await expect(store.exportAll('alpha', () => true)).rejects.toThrow('Synthetic relations page failure');
      await new Promise<void>(resolve => { setTimeout(resolve, 0); });
      expect(relations).toHaveBeenCalledTimes(2);
      expect(blocks.mock.calls.length).toBeLessThan(10);
    });
  });

  it('rejects when the account changes between pages', async () => {
    await withStore(async store => {
      let current = true;
      const relations = vi.fn(async (): Promise<FriendPage<FriendPair>> => { current = false; return { items: [item('pair-1')], cursor: token }; });
      install(store, relations, pager<FriendGroup>([[item('group-1')]]), pager<FriendBlock>([[item('block-1')]]));
      await expect(store.exportAll('alpha', () => current)).rejects.toThrow('The account changed before export completed.');
      expect(relations).toHaveBeenCalledOnce();
    });
  });

  it('refuses an export that needs more than 100 pages of one collection', async () => {
    await withStore(async store => {
      const relations = vi.fn(async (): Promise<FriendPage<FriendPair>> => ({ items: [item('pair')], cursor: token }));
      install(store, relations, pager<FriendGroup>([[item('group-1')]]), pager<FriendBlock>([[item('block-1')]]));
      await expect(store.exportAll('alpha', () => true)).rejects.toThrow('This account export is too large to download at once.');
      expect(relations).toHaveBeenCalledTimes(100);
    });
  });
});
