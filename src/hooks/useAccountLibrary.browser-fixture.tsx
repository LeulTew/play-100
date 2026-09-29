import { StrictMode, useCallback, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAccountLibrary } from './useAccountLibrary';
import { accountScope } from '../lib/cloud-types';
import { accountStorageTransaction, loadPersonalLibrary } from '../lib/personal-db';
import { accountJournal, deleteScopedLibrary, loadScopedLibrary } from '../lib/scoped-library';
import type { AccountWriter } from '../lib/scoped-library';
import { updateFriendSelectionCache } from '../lib/friend-selection-cache';
import { friendShelfJournal } from '../lib/friend-shelf-selection-cache';
import { friendShelfSelectionKey } from '../lib/friend-shelf-selection';
import { saveFriendAllCooldown } from '../lib/friend-all-work';
import { readStoredValue } from '../../tests/fixtures/device-store-inspection';
import { compareTrayStorageKey, serializeCompareTray } from '../lib/compare-tray';
import { motionHintKey } from '../lib/motion-hint';
import type { LibraryRecord } from '../lib/personal-types';
import { signOutTransition } from '../cloud/sign-out-transition';

export interface AccountWriterFixture {
  holdRating(score: number): void;
  release(): Promise<boolean>;
  signOut(remove: boolean): Promise<boolean>;
  reopen(): void;
  save(score: number): Promise<boolean>;
  refresh(): Promise<void>;
  inspect(): Promise<{
    present: boolean;
    score: number | null;
    guestRecords: number;
    hint: string | null;
    pins: string | null;
  }>;
  commandsStable(): boolean;
  /** Starts this tab's three sharing-journal writes for the copy it has open, to run when released. */
  holdJournals(): void;
  /** Runs the held journal writes: whether each saved. */
  releaseJournals(): Promise<JournalOutcome>;
  /** Saves the three journals now, for the copy this tab has open: whether each saved. */
  writeJournals(): Promise<JournalOutcome>;
  /** Which of the account's three journals the device database holds. */
  inspectJournals(): Promise<JournalOutcome>;
}
export interface JournalOutcome {
  selection: boolean;
  shelf: boolean;
  cooldown: boolean;
}
declare global {
  interface Window {
    accountWriterFixture: AccountWriterFixture;
  }
}

const scope = accountScope('two-tab-writer', 'demo-play100');
const game: LibraryRecord = {
  id: 'synthetic-canonical',
  source: 'collection',
  sourceId: 'synthetic-canonical',
  title: 'Synthetic canonical game',
  year: 2020,
  studio: null,
  genre: null,
  sourceUrl: null,
  collectionRank: 1,
};
let held: (() => Promise<boolean>) | null = null;
let heldJournals: (() => Promise<JournalOutcome>) | null = null;

// The three sharing-journal writes of the copy a writer opened, each reported as saved or refused.
function journalWrites(writer: AccountWriter, stateRevision: number): () => Promise<JournalOutcome> {
  const journal = accountJournal(writer);
  const saved = (write: Promise<void>) =>
    write.then(
      () => true,
      () => false,
    );
  return async () => {
    const [selection, shelf, cooldown] = await Promise.all([
      saved(updateFriendSelectionCache(journal, 1, [game.id], undefined, stateRevision)),
      saved(friendShelfJournal.update(journal, 1, [game.id], undefined, stateRevision)),
      saved(saveFriendAllCooldown(journal, { version: 2, epoch: 1, nextAttemptAt: 1 })),
    ]);
    return { selection, shelf, cooldown };
  };
}
let firstPerform: unknown;
let firstRestore: unknown;

export default function Fixture() {
  const [session, setSession] = useState({ signedIn: true, generation: 0 });
  const identityIsCurrent = useCallback(() => session.signedIn, [session.signedIn]);
  const account = useAccountLibrary(session.signedIn ? scope : null, 'lite', identityIsCurrent, session.generation);
  useLayoutEffect(() => {
    const perform = account.controller.perform;
    const rate = (score: number) => perform({ type: 'rate-game', record: game, score });
    window.accountWriterFixture = {
      holdRating(score) {
        held = () => rate(score);
        firstPerform = perform;
        firstRestore = account.controller.restore;
      },
      async release() {
        const save = held;
        held = null;
        if (!save) throw new Error('Hold a direct rating before releasing it.');
        return save();
      },
      async signOut(remove) {
        const writer = account.writer;
        if (!writer) throw new Error('The account writer is not ready.');
        localStorage.setItem(compareTrayStorageKey(scope), serializeCompareTray(scope, [game]));
        const result = await signOutTransition(remove, {
          current: () => session.signedIn,
          waitForWrites: account.waitForWrites,
          readDeviceCopy: () => loadScopedLibrary(writer),
          suspend: () => [],
          signOut: async () => {
            setSession((prior) => ({ ...prior, signedIn: false }));
          },
          removeDeviceCopy: (revision) => deleteScopedLibrary(writer, revision),
        });
        return result.complete;
      },
      reopen() {
        setSession((prior) => ({ signedIn: true, generation: prior.generation + 1 }));
      },
      save: rate,
      refresh: account.refresh,
      async inspect() {
        const row = await accountStorageTransaction(scope, (value) => value);
        const guest = await loadPersonalLibrary([]);
        const ranking =
          row &&
          typeof row === 'object' &&
          'state' in row &&
          row.state &&
          typeof row.state === 'object' &&
          'ranking' in row.state &&
          Array.isArray(row.state.ranking)
            ? row.state.ranking
            : [];
        const entry: unknown = ranking.find(
          (value: unknown) => value && typeof value === 'object' && 'id' in value && value.id === game.id,
        );
        return {
          present: row !== undefined,
          score:
            entry && typeof entry === 'object' && 'score' in entry && typeof entry.score === 'number'
              ? entry.score
              : null,
          guestRecords: Object.keys(guest.state.records).length,
          hint: localStorage.getItem(motionHintKey(scope)),
          pins: localStorage.getItem(compareTrayStorageKey(scope)),
        };
      },
      commandsStable: () => perform === firstPerform && account.controller.restore === firstRestore,
      holdJournals() {
        const writer = account.writer;
        if (!writer) throw new Error('The account writer is not ready.');
        heldJournals = journalWrites(writer, account.snapshot?.state.revision ?? 0);
      },
      releaseJournals() {
        const writes = heldJournals;
        heldJournals = null;
        if (!writes) throw new Error('Hold the journal writes before releasing them.');
        return writes();
      },
      writeJournals() {
        const writer = account.writer;
        if (!writer) throw new Error('The account writer is not ready.');
        return journalWrites(writer, account.snapshot?.state.revision ?? 0)();
      },
      async inspectJournals() {
        const [selection, shelf, cooldown] = await Promise.all(
          [`friends-selection:v1:${scope}`, friendShelfSelectionKey(scope), `friends-all-work:v2:${scope}`].map((key) =>
            readStoredValue(key),
          ),
        );
        return { selection: selection !== undefined, shelf: shelf !== undefined, cooldown: cooldown !== undefined };
      },
    };
  }, [account, session]);
  return (
    <main>
      <h1>Account writer fixture</h1>
      <p role="status">{!session.signedIn ? 'Signed out' : (account.error ?? account.controller.status)}</p>
      {session.signedIn && account.error && (
        <div>
          <p role="alert">{account.error}</p>
          <button
            onClick={() => {
              void account.refresh();
            }}
          >
            Retry device library
          </button>
        </div>
      )}
    </main>
  );
}

const mount = document.getElementById('mount');
if (!mount) throw new Error('Account writer fixture mount is missing.');
createRoot(mount).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
