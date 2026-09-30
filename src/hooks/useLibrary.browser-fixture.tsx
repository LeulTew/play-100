import { StrictMode, useCallback, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GlobalBanners } from '../components/app/GlobalBanners';
import BackupPanel from '../components/personal/BackupPanel';
import type { LibraryRecord } from '../lib/personal-types';
import { useLibrary } from './useLibrary';
import { useOnlineState } from './useOnlineState';
import { useAccountLibrary } from './useAccountLibrary';
import { accountScope } from '../lib/cloud-types';
import { useNavigationScope } from './useNavigationScope';
import '../styles.css';
import '../shared-ui.css';

const records: LibraryRecord[] = [];
const temporaryGame: LibraryRecord = {
  id: 'manual:temporary-retry',
  title: 'Temporary retry game',
  year: null,
  studio: null,
  genre: null,
  source: 'manual',
  sourceId: 'temporary-retry',
  sourceUrl: null,
  collectionRank: null,
};

export function LibraryRetryFixture() {
  const guestLibrary = useLibrary(records, false);
  const online = useOnlineState();
  const { captureFocusGuard } = useNavigationScope(online.libraryScope);
  const { setOnline } = online;
  const restoredUser = new URLSearchParams(location.search).has('signed-in');
  const accountRequested = online.onlineRequested && restoredUser;
  const identityIsCurrent = useCallback(() => accountRequested, [accountRequested]);
  const account = useAccountLibrary(
    accountRequested ? accountScope('retry-user', 'demo-play100') : null,
    'lite',
    identityIsCurrent,
  );
  useLayoutEffect(() => {
    if (!accountRequested) return;
    // Auth identity is fixture-owned; hint discovery, scoped cache opening and the app bridge are real.
    setOnline({
      loading: account.controller.status === 'loading',
      identity: {
        uid: 'retry-user',
        email: 'fixture@example.invalid',
        displayName: 'Retry player',
        verified: true,
        providers: [],
      },
      controller: account.controller,
      scope: accountScope('retry-user', 'demo-play100'),
      enabled: false,
      status: 'paused',
      label: 'Retry player',
      creator: false,
      headerIdentity: null,
    });
  }, [accountRequested, account.controller, setOnline]);
  const library = online.online?.controller ?? guestLibrary;
  const retry = (revision?: number) => online.retryOpening(() => guestLibrary.retry(revision));
  const recovery = guestLibrary.canRetry || online.hintBlocked || online.retryingOpening;
  useLayoutEffect(() => {
    window.libraryRetryFixture = {
      state: () => library.state,
      retry,
      addTemporary: () => guestLibrary.perform({ type: 'add-ranking', records: [temporaryGame] }),
      hintError: online.hintError,
      opening: online.onlineOpening,
      scope: online.libraryScope,
    };
  });
  return (
    <>
      <GlobalBanners
        warning={library.error ?? library.warning}
        onlineConfigError={null}
        offline={false}
        offlineReady={false}
        hintError={online.hintError}
        hintBlocked={online.hintBlocked}
        onSettings={() => document.getElementById('backup-tools')?.focus()}
        onAccount={() => {}}
        onDeviceOnly={() => {}}
        onRetryLibrary={recovery ? retry : undefined}
        onDiscardTemporary={recovery && guestLibrary.discardRequired ? retry : undefined}
        temporaryRevision={guestLibrary.state.revision}
        retryBusy={guestLibrary.busy || online.retryingOpening}
        captureRetryFocus={captureFocusGuard}
      />
      <main id="page-main">
        <h1 data-page-heading tabIndex={-1} hidden={online.onlineOpening}>
          My games
        </h1>
        <output id="library-status">{library.status}</output>
        <output id="library-scope">{online.libraryScope}</output>
        <output id="opening-status">{online.onlineOpening ? 'Opening' : 'Opened'}</output>
        <button id="other-focus" type="button">
          Another action
        </button>
        <button
          type="button"
          aria-disabled={library.busy || undefined}
          onClick={() => {
            if (!library.busy) void library.perform({ type: 'add-ranking', records: [temporaryGame] });
          }}
        >
          Add temporary game
        </button>
        <ul>
          {Object.values(library.state.records).map((record) => (
            <li key={record.id}>{record.title}</li>
          ))}
        </ul>
        <section>
          <h2 id="backup-tools" tabIndex={-1}>
            Settings backups
          </h2>
          <BackupPanel
            state={library.state}
            busy={library.busy}
            persistent={library.status === 'ready'}
            onRestore={library.restore}
          />
        </section>
      </main>
    </>
  );
}

const mount = document.getElementById('mount');
if (!mount) throw new Error('The library retry fixture has no mount element.');
createRoot(mount).render(
  <StrictMode>
    <LibraryRetryFixture />
  </StrictMode>,
);
