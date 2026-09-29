import { StrictMode, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GlobalBanners } from '../components/app/GlobalBanners';
import BackupPanel from '../components/personal/BackupPanel';
import type { LibraryRecord } from '../lib/personal-types';
import { useLibrary } from './useLibrary';
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
  const library = useLibrary(records, false);
  useLayoutEffect(() => {
    window.libraryRetryFixture = {
      state: () => library.state,
      retry: library.retry,
      addTemporary: () => library.perform({ type: 'add-ranking', records: [temporaryGame] }),
    };
  }, [library]);
  return (
    <>
      <GlobalBanners
        warning={library.error ?? library.warning}
        onlineConfigError={null}
        offline={false}
        offlineReady={false}
        hintError=""
        onSettings={() => document.getElementById('backup-tools')?.focus()}
        onAccount={() => {}}
        onDeviceOnly={() => {}}
        onRetryLibrary={library.canRetry ? library.retry : undefined}
        onDiscardTemporary={library.discardRequired ? library.retry : undefined}
        temporaryRevision={library.state.revision}
        retryBusy={library.busy}
      />
      <main id="page-main">
        <h1 data-page-heading tabIndex={-1}>
          My games
        </h1>
        <output id="library-status">{library.status}</output>
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
