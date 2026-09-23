import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_LIMITS, AccountQuotaFull, requireVisibleCapacity } from './account-quota';

describe('bounded account product limits', () => {
  it('pins the client group, block and report caps to their server-side bounds', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    const slots = rules.match(/kind == 'groups' \? (\d+) : (\d+)/);
    expect(slots?.slice(1).map(Number)).toEqual([ACCOUNT_LIMITS.groups, ACCOUNT_LIMITS.blocks]);
    expect(rules).toContain(`after.count <= ${ACCOUNT_LIMITS.reports}`);
    expect(rules).toContain(`request.resource.data.count <= ${ACCOUNT_LIMITS.reports}`);
  });
  it.each(['groups', 'blocks', 'reports'] as const)('counts every visible %s record, including legacy, before allowing creation', async kind => {
    const limit = ACCOUNT_LIMITS[kind];
    const read = vi.fn(async (cursor = 0) => {
      const size = Math.min(20, limit - cursor);
      return { items: Array.from({ length: size }, (_, index) => ({ id: cursor + index, legacy: index % 2 === 0 })),
        cursor: cursor + size < limit ? cursor + size : undefined };
    });
    await expect(requireVisibleCapacity<number>(kind, read)).rejects.toBeInstanceOf(AccountQuotaFull);
    expect(read).toHaveBeenCalledTimes(Math.ceil(limit / 20));
  });
  it('allows remaining room, but never treats an unreadable or nonprogressing list as empty', async () => {
    await expect(requireVisibleCapacity('groups', async () => ({ items: Array(49).fill('fixture'), cursor: undefined }))).resolves.toBeUndefined();
    await expect(requireVisibleCapacity('groups', async () => { throw new Error('Offline'); })).rejects.toThrow('Offline');
    await expect(requireVisibleCapacity('groups', async () => ({ items: [], cursor: 'unchanged' }))).rejects.toThrow(/could not be counted/);
  });
});
