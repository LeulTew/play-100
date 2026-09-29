import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  backupFileSizeError,
  describeLibraryBackup,
  exportLibraryBackup,
  readLibraryBackup,
} from '../../lib/personal-library';
import type { PersonalLibraryState } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { useLibraryMode } from '../../lib/library-mode';
import { focusPendingEditor } from '../../lib/dialog-focus';
import { foregroundDialog } from '../dialog-layer';

export default function BackupPanel({
  state,
  busy,
  persistent,
  onRestore,
  onActionStart,
}: {
  state: PersonalLibraryState;
  busy: boolean;
  persistent: boolean;
  onRestore: (state: PersonalLibraryState) => Promise<boolean>;
  onActionStart?: () => void;
}) {
  const mode = useLibraryMode();
  const input = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const restorePending = useRef(false);
  const returnToImport = useRef(false);
  const [incoming, setIncoming] = useState<PersonalLibraryState | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [storageStatus, setStorageStatus] = useState<'unknown' | 'granted' | 'best-effort'>('unknown');
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    if (!returnToImport.current || incoming || busy || restoring) return;
    returnToImport.current = false;
    const target = importButton.current;
    if (target?.closest('dialog') === foregroundDialog()) focusPendingEditor(target);
  }, [incoming, busy, restoring]);
  const restoreBackup = async (backup: PersonalLibraryState) => {
    if (busy || restorePending.current) return;
    restorePending.current = true;
    setRestoring(true);
    onActionStart?.();
    setError('');
    setMessage('');
    try {
      const success = await onRestore(backup);
      if (!active.current) return;
      if (success) {
        returnToImport.current =
          document.activeElement === document.body || Boolean(preview.current?.contains(document.activeElement));
        setIncoming(null);
        setMessage('Your backup was restored and saved on this device.');
      } else setError('Restore failed. Your existing library was not replaced.');
    } catch (cause: unknown) {
      console.error('The backup could not be restored.', cause);
      if (active.current) setError('Restore failed. Your existing library was not replaced.');
    } finally {
      restorePending.current = false;
      if (active.current) setRestoring(false);
    }
  };
  useEffect(() => {
    if (!navigator.storage?.persisted) return;
    let canceled = false;
    void navigator.storage
      .persisted()
      .then((granted) => {
        if (!canceled) setStorageStatus(granted ? 'granted' : 'best-effort');
      })
      .catch(() => {
        if (!canceled) setMessage('This browser could not check storage protection. Keep a downloaded backup.');
      });
    return () => {
      canceled = true;
    };
  }, []);
  const exportBackup = () => {
    onActionStart?.();
    setError('');
    setMessage('');
    const backup = exportLibraryBackup(state);
    if (!backup.ok) {
      setError(backup.message);
      return;
    }
    const blob = new Blob([backup.text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    link.download = `Play-100-My-Library-${date}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Backup download started. It includes My games, Play later, rankings, notes and preferences.');
  };
  const readBackup = async (file: File | undefined) => {
    if (busy || restorePending.current) return;
    onActionStart?.();
    setError('');
    setMessage('');
    setIncoming(null);
    if (!file) return;
    const tooLarge = backupFileSizeError(file.size);
    if (tooLarge) {
      setError(tooLarge);
      if (input.current) input.current.value = '';
      return;
    }
    setReading(true);
    try {
      setIncoming(readLibraryBackup(await file.text()));
    } catch (cause: unknown) {
      setError(
        cause instanceof Error && cause.name === 'PersonalLibraryBudgetError'
          ? cause.message
          : cause instanceof Error && cause.name === 'PersonalLibraryValidationError'
            ? "This isn't a supported Play 100 backup. Choose a JSON file made with Export my library. Your existing data hasn't changed."
            : "This backup could not be read as JSON. Choose a file made with Export my library, then try again. Your existing data hasn't changed.",
      );
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  };
  const protectStorage = async () => {
    if (!navigator.storage?.persist) {
      setMessage('This browser does not support requesting storage protection. Keep a downloaded backup.');
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      setStorageStatus(granted ? 'granted' : 'best-effort');
      setMessage(
        granted
          ? 'Storage protection was granted.'
          : 'This browser did not grant storage protection. Your library is still saved on this device; keep a downloaded backup.',
      );
    } catch {
      setError('The browser could not request storage protection. Keep a downloaded backup.');
    }
  };
  return (
    <section className="backup-panel">
      <h3>Backups</h3>
      <p>
        {persistent ? (
          'Download a backup to move or recover your library.'
        ) : (
          <>
            <strong>Device storage is unavailable.</strong> Your changes are temporary. Export them before closing this
            tab.
          </>
        )}
      </p>
      <div className="button-row">
        <button className="button button-dark" onClick={exportBackup} disabled={busy}>
          <Icon name="download" width="17" height="17" />
          Export my library
        </button>
        <button
          ref={importButton}
          className="button button-outline"
          aria-disabled={busy || reading || restoring || undefined}
          onClick={() => {
            if (busy || reading || restorePending.current) return;
            onActionStart?.();
            input.current?.click();
          }}
        >
          <Icon name="upload" width="17" height="17" />
          {reading ? 'Reading backup…' : 'Import backup'}
        </button>
      </div>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        tabIndex={-1}
        aria-label="Import personal library backup file"
        onChange={(event) => {
          void readBackup(event.target.files?.[0]);
        }}
      />
      {incoming && (
        <div className="restore-preview" ref={preview}>
          <p>
            <strong>{describeLibraryBackup(incoming)}</strong>
          </p>
          <p>
            Restoring replaces the active library and device preferences.{' '}
            {mode.scope !== 'guest' &&
              'This replacement will sync to the account if online saving is enabled. The guest library stays separate.'}{' '}
            Export your current library first if you want to keep both.
          </p>
          <div className="button-row">
            <button
              className="button button-dark"
              aria-disabled={busy || restoring || undefined}
              onClick={() => {
                void restoreBackup(incoming);
              }}
            >
              Replace with this backup
            </button>
            <button
              className="button button-outline"
              aria-disabled={busy || restoring || undefined}
              onClick={() => {
                if (busy || restorePending.current) return;
                returnToImport.current = true;
                setIncoming(null);
              }}
            >
              Cancel import
            </button>
          </div>
        </div>
      )}
      {persistent && (
        <>
          <p className="storage-info-line">
            {storageStatus === 'granted'
              ? 'Protection from automatic storage cleanup is enabled.'
              : 'Ask your browser for protection from automatic storage cleanup.'}{' '}
            Clearing site data can still remove your library.
          </p>
          {storageStatus !== 'granted' && (
            <button
              className="text-button"
              onClick={() => {
                void protectStorage();
              }}
            >
              Ask browser to protect saved data
              <Icon name="arrow" width="16" height="16" />
            </button>
          )}
        </>
      )}
      {message && (
        <p className="storage-info-line" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
