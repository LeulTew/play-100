import { IDBFactory, IDBDatabase } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePersonalLibrary } from '../src/lib/personal-library';
import {
  assertBlockedEvidence,
  assertMixedEvidence,
  candidateNote,
  mixedFixture,
  observeConnections,
  staleDraft,
  type DatabaseSnapshot,
  type ConnectionEvent,
} from './release-sw-mixed';
import { failedSwChecks, swProtocolChecks } from './release-sw-browser';

function mixedFacts() {
  const before: DatabaseSnapshot = { version: 2, rows: [['state', mixedFixture()]] };
  const saved = mixedFixture();
  saved.ranking = saved.ranking.slice(1).map((row) => ({ ...row, note: candidateNote }));
  saved.revision++;
  const savedByB: DatabaseSnapshot = { version: 3, rows: [['state', saved]] };
  return {
    before,
    upgraded: { ...before, version: 3 },
    savedByB,
    afterOldSave: structuredClone(savedByB),
    events: [
      { kind: 'open', connection: 0, version: 2 },
      { kind: 'versionchange', connection: 0, version: 2, nextVersion: 3 },
      { kind: 'close', connection: 0, version: 2 },
    ] as ConnectionEvent[],
    closedHandleError: 'InvalidStateError',
    draftBefore: staleDraft,
    draftAfter: staleDraft,
    saveError: 'The note could not be saved. Keep this field open to retry or copy your text.',
    versionErrorAfterSave: true,
  };
}

describe('mixed-version phase acceptance', () => {
  it('uses valid saved guest data and requires the three new campaign checks', () => {
    expect(parsePersonalLibrary(mixedFixture())).toEqual(mixedFixture());
    const checks = Object.fromEntries(
      swProtocolChecks
        .filter((name) => !['mixedVersion', 'blockedUpgrade', 'blockedReload'].includes(name))
        .map((name) => [name, true]),
    );
    expect(failedSwChecks(checks)).toEqual(['mixedVersion', 'blockedUpgrade', 'blockedReload']);
    expect(() => assertMixedEvidence(mixedFacts())).not.toThrow();
  });
  it.each([
    [
      'connection stays open',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.events.pop();
      },
    ],
    [
      'unrelated handle closes',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.events[2]!.connection = 1;
      },
    ],
    [
      'close predates upgrade',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.events.reverse();
      },
    ],
    [
      'still usable handle',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.closedHandleError = 'StillOpen';
      },
    ],
    [
      'wrong database version',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.upgraded.version = 2;
      },
    ],
    [
      'upgrade changed saved rows',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.upgraded.rows = [];
      },
    ],
    [
      'discarded pending text',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.draftAfter = '';
      },
    ],
    [
      'no visible error',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.saveError = '';
      },
    ],
    [
      'no attempted v2 reopen',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.versionErrorAfterSave = false;
      },
    ],
    [
      'old save corrupts candidate',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.afterOldSave.rows = [];
      },
    ],
    [
      'candidate never saved',
      (facts: ReturnType<typeof mixedFacts>) => {
        facts.savedByB = { ...facts.before, version: 3 };
        facts.afterOldSave = facts.savedByB;
      },
    ],
  ])('holds on %s', (_name, mutate) => {
    const facts = mixedFacts();
    mutate(facts);
    expect(() => assertMixedEvidence(facts)).toThrow();
  });
  it.each(['blocked-notice-button', 'explicit-browser-reload'])('requires safe recovery via %s', (retry) => {
    const before: DatabaseSnapshot = { version: 2, rows: [['state', mixedFixture()]] };
    const facts = {
      before,
      blocked: structuredClone(before),
      afterRetry: { ...before, version: 3 },
      notice:
        'Close other Play 100 tabs to finish updating this device library, then retry. Your saved data has not been changed.',
      versionchanges: 1,
      blockedNoticeCount: 1,
      recoveredNoticeCount: 0,
      reblockedNoticeCount: 1,
      retry,
      retryReloads: retry === 'blocked-notice-button' ? 0 : 1,
      stillBlockedAfterRetry: structuredClone(before),
      retryFocused: true,
    };
    expect(() => assertBlockedEvidence(facts)).not.toThrow();
    expect(() => assertBlockedEvidence({ ...facts, versionchanges: 0 })).toThrow();
    expect(() => assertBlockedEvidence({ ...facts, blocked: { ...before, version: 3 } })).toThrow();
    expect(() => assertBlockedEvidence({ ...facts, afterRetry: { version: 3, rows: [] } })).toThrow();
    expect(() => assertBlockedEvidence({ ...facts, notice: 'Storage unavailable' })).toThrow();
    for (const blockedNoticeCount of [0, 2])
      expect(() => assertBlockedEvidence({ ...facts, blockedNoticeCount })).toThrow();
    expect(() => assertBlockedEvidence({ ...facts, recoveredNoticeCount: 1 })).toThrow();
    expect(() => assertBlockedEvidence({ ...facts, retry: 'reset-database' })).toThrow();
    expect(() => assertBlockedEvidence({ ...facts, retryReloads: 2 })).toThrow();
    if (retry === 'blocked-notice-button') {
      expect(() => assertBlockedEvidence({ ...facts, retryFocused: false })).toThrow();
      expect(() => assertBlockedEvidence({ ...facts, stillBlockedAfterRetry: undefined })).toThrow();
      for (const reblockedNoticeCount of [undefined, 0, 2])
        expect(() => assertBlockedEvidence({ ...facts, reblockedNoticeCount })).toThrow();
    }
  });
});

describe('native connection observer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('records real versionchange and the app close without itself unblocking the upgrade', async () => {
    const factory = new IDBFactory();
    vi.stubGlobal('window', {});
    vi.stubGlobal('IDBFactory', IDBFactory);
    vi.stubGlobal('IDBDatabase', IDBDatabase);
    const open = IDBFactory.prototype.open,
      close = IDBDatabase.prototype.close;
    let db: IDBDatabase | undefined;
    try {
      observeConnections();
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open('play100-personal', 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
      });
      const request = factory.open('play100-personal', 3);
      const upgraded = new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
      });
      await new Promise<void>((resolve) => {
        request.onblocked = () => resolve();
      });
      expect(window.__mixedEvents.some((row) => row.kind === 'versionchange')).toBe(true);
      expect(window.__mixedEvents.some((row) => row.kind === 'close')).toBe(false);
      db.close();
      const next = await upgraded;
      next.close();
      expect(window.__mixedEvents.slice(0, 3).map((row) => row.kind)).toEqual(['open', 'versionchange', 'close']);
    } finally {
      db?.close();
      IDBFactory.prototype.open = open;
      IDBDatabase.prototype.close = close;
    }
  });
});
