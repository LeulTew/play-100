import { deleteApp, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudStore } from './cloud-store';

const reads = vi.hoisted(() => ({ document: vi.fn(), list: vi.fn(), writes: vi.fn() }));
vi.mock('firebase/firestore', async original => ({
  ...await original<typeof import('firebase/firestore')>(),
  getDocFromServer: reads.document, getDocsFromServer: reads.list, runTransaction: reads.writes,
}));
const app = initializeApp({ projectId: 'demo-play100' }, 'deletion-copy-probe');
const store = new CloudStore(getFirestore(app), 'ProbeOwner');
beforeEach(() => {
  vi.clearAllMocks();
  reads.document.mockResolvedValue({ exists: () => false });
  reads.list.mockResolvedValue({ empty: true });
});
afterAll(() => deleteApp(app));

describe('bounded read-only deletion notice probe', () => {
  it('reports complete using exactly four reads and no cleanup writes', async () => {
    expect(await store.probeDeletedCopy()).toBe('complete');
    expect(reads.document).toHaveBeenCalledTimes(2);
    expect(reads.list).toHaveBeenCalledTimes(2);
    expect(reads.writes).not.toHaveBeenCalled();
  });
  it.each(['library', 'ranking', 'registry', 'profile'])('reports incomplete when %s still exists', async kind => {
    if (kind === 'library') reads.list.mockResolvedValueOnce({ empty: false });
    if (kind === 'ranking') reads.list.mockResolvedValueOnce({ empty: true }).mockResolvedValueOnce({ empty: false });
    if (kind === 'registry') reads.document.mockResolvedValueOnce({ exists: () => true, data: () => ({ ids: ['generation'] }) });
    if (kind === 'profile') reads.document.mockResolvedValueOnce({ exists: () => false }).mockResolvedValueOnce({ exists: () => true });
    expect(await store.probeDeletedCopy()).toBe('incomplete');
    expect(reads.document).toHaveBeenCalledTimes(2);
    expect(reads.list).toHaveBeenCalledTimes(2);
    expect(reads.writes).not.toHaveBeenCalled();
  });
  it.each(['permission-denied', 'unavailable'])('reports unknown for %s without silently claiming deletion or retrying', async code => {
    reads.list.mockRejectedValueOnce(Object.assign(new Error('Synthetic probe failure'), { code }));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await store.probeDeletedCopy()).toBe('unknown');
      expect(warning).toHaveBeenCalledOnce();
      expect(reads.document).toHaveBeenCalledTimes(2);
      expect(reads.list).toHaveBeenCalledTimes(2);
      expect(reads.writes).not.toHaveBeenCalled();
    } finally { warning.mockRestore(); }
  });
});
