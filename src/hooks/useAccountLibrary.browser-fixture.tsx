import { StrictMode, useCallback, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useAccountLibrary } from './useAccountLibrary';
import { accountScope } from '../lib/cloud-types';
import { accountStorageTransaction, loadPersonalLibrary } from '../lib/personal-db';
import { deleteScopedLibrary, loadScopedLibrary } from '../lib/scoped-library';
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
    };
  }, [account, session]);
  return (
    <main>
      <h1>Account writer fixture</h1>
      <p role="status">{!session.signedIn ? 'Signed out' : (account.error ?? account.controller.status)}</p>
      {session.signedIn && account.error && (
        <div>
          <p role="alert">{account.error}</p>
          <button onClick={() => { void account.refresh(); }}>Retry device library</button>
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
