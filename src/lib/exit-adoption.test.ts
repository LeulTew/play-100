import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasPendingEdits, registerPendingEditor } from '../hooks/useExitSave';
import { accountScope } from './cloud-types';
import type { SyncHead } from './cloud-types';
import { adoptScopedRemote, commitScopedAction, connectScopedLibrary, loadScopedLibrary } from './scoped-library';
import { closePersonalLibrary } from './personal-db';
import { emptyPersonalLibrary } from './personal-library';
import type { LibraryRecord } from './personal-types';

afterEach(() => { closePersonalLibrary(); vi.unstubAllGlobals(); });
describe('closing editor protection during a queued remote adoption', () => {
  it('keeps the exit flush registered until its local commit settles, blocking earlier adoption', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('window', undefined);
    const scope = accountScope('exit-race');
    const head: SyncHead = { format: 1, epoch: 1, revision: 1, enabled: true, deleted: false, current: null, previous: null, updatedAt: 1 };
    const initial = await loadScopedLibrary(scope);
    await connectScopedLibrary(scope, emptyPersonalLibrary(), head, 'Exit test', false, { localRevision: initial.state.revision, epoch: 0, enabled: false });
    const record: LibraryRecord = { id: 'example', title: 'Example', source: 'collection', sourceId: 'example', collectionRank: 1, sourceUrl: null, year: 2020, studio: null, genre: null };
    const before = await commitScopedAction(scope, { type: 'rate-game', record, score: 5 });
    let completeWrite: (() => void) | undefined;
    const writing = new Promise<void>((resolve) => { completeWrite = resolve; });
    const release = registerPendingEditor({
      pending: () => true,
      flush: async () => {
        await writing;
        await commitScopedAction(scope, { type: 'edit-ranking', id: record.id, score: 8.8 });
        return true;
      },
    });
    const exiting = release();
    expect(hasPendingEdits()).toBe(true);
    await expect(adoptScopedRemote(scope, emptyPersonalLibrary(), { ...head, revision: 2 }, before.state.revision, true, () => !hasPendingEdits())).rejects.toThrow(/changed/);
    expect((await loadScopedLibrary(scope)).state.ranking[0]?.score).toBe(5);
    completeWrite?.();
    expect(await exiting).toBe(true);
    expect(hasPendingEdits()).toBe(false);
    expect((await loadScopedLibrary(scope)).state.ranking[0]?.score).toBe(8.8);
  });
});
