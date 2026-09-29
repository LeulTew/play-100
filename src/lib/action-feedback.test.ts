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
});
