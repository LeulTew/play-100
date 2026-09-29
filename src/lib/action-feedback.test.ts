import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePersonalLibrary, commitPersonalAction, loadPersonalLibrary } from './personal-db';
import { commitScopedAction, openScopedLibrary, scopedWriter } from './scoped-library';
import { accountScope } from './cloud-types';
import { discoveryFixture } from './discovery-test-fixtures';
import type { ActionFeedback } from './action-message';
import type { PersonalAction } from './personal-types';

beforeEach(() => {
  closePersonalLibrary();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => {
  closePersonalLibrary();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(['guest', 'account'] as const)('%s committed feedback', (scope) => {
  async function start() {
    if (scope === 'guest') {
      await loadPersonalLibrary([]);
      return commitPersonalAction;
    }
    const writer = scopedWriter(await openScopedLibrary(accountScope('feedback')));
    return (action: PersonalAction, feedback?: ActionFeedback) => commitScopedAction(writer, action, feedback);
  }
  it('reads the authoritative previous transaction rather than stale caller state', async () => {
    const commit = await start();
    const records = [discoveryFixture.record, { ...discoveryFixture.record, id: 'manual:other', title: 'Other' }];
    await commit({ type: 'set-progress', records: records.slice(0, 1), key: 'later', value: true });
    const feedback: ActionFeedback = {};
    await commit({ type: 'set-progress', records, key: 'later', value: true }, feedback);
    expect(feedback.message).toBe('1 game added to Play later; 1 was already there.');
  });
  it('does not publish a success message when the write is refused', async () => {
    const commit = await start();
    const feedback: ActionFeedback = {};
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    await expect(commit({ type: 'rate-game', record: discoveryFixture.record, score: 8 }, feedback)).rejects.toThrow();
    expect(feedback.message).toBeUndefined();
  });

  it('names the committed game and actual ranking position for single changes', async () => {
    const commit = await start();
    const record = discoveryFixture.record;
    const feedback: ActionFeedback = {};
    const earlier = Array.from({ length: 3 }, (_, index) => ({
      ...record,
      id: `manual:earlier-${index}`,
      title: `Earlier ${index}`,
    }));
    await commit({ type: 'add-ranking', records: earlier });
    await commit({ type: 'add-records', records: [record] }, feedback);
    expect(feedback.message).toBe(`${record.title} added to My games.`);
    await commit({ type: 'add-ranking', records: [record] }, feedback);
    expect(feedback.message).toBe(`${record.title} added to your ranking at #4.`);
    await commit({ type: 'edit-ranking', id: record.id, note: 'Private draft' }, feedback);
    expect(feedback.message).toBe(`${record.title}: note saved.`);
    await commit({ type: 'remove-ranking', ids: [record.id] }, feedback);
    expect(feedback.message).toBe(`${record.title} removed from your ranking.`);
  });
});
