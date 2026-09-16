import { useEffect, useRef, useState } from 'react';
import { createLibraryBackup, parseLibraryBackup } from '../../lib/personal-library';
import type { PersonalLibraryState } from '../../lib/personal-types';
import { Icon } from '../Icon';
import { useLibraryMode } from '../../lib/library-mode';

export default function BackupPanel({ state, busy, persistent, onRestore }: {
  state: PersonalLibraryState; busy: boolean; persistent: boolean; onRestore: (state: PersonalLibraryState) => Promise<boolean>;
}) {
  const mode = useLibraryMode();
  const input = useRef<HTMLInputElement>(null);
  const [incoming, setIncoming] = useState<PersonalLibraryState | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [storageStatus, setStorageStatus] = useState<'unknown' | 'granted' | 'best-effort'>('unknown');
  useEffect(() => {
    if (!navigator.storage?.persisted) return;
    let canceled = false;
    void navigator.storage.persisted().then((granted) => { if (!canceled) setStorageStatus(granted ? 'granted' : 'best-effort'); }).catch(() => {
      if (!canceled) setMessage('This browser could not report eviction protection. Keep an exported backup.');
    });
    return () => { canceled = true; };
  }, []);
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(createLibraryBackup(state), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Play-100-My-Library-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Backup download started. It includes your games, queue, rankings, notes and preferences.');
  };
  const readBackup = async (file: File | undefined) => {
    setError(''); setMessage(''); setIncoming(null);
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError('This backup exceeds the 20 MB import limit. No data was changed.'); return; }
    setReading(true);
    try { setIncoming(parseLibraryBackup(JSON.parse(await file.text()))); }
    catch (cause: unknown) { setError(`This backup could not be read. No data was changed. ${cause instanceof Error ? cause.message : ''}`); }
    finally { setReading(false); if (input.current) input.current.value = ''; }
  };
  const protectStorage = async () => {
    if (!navigator.storage?.persist) { setMessage('This browser does not support requesting eviction protection. A downloaded backup is still available.'); return; }
    try {
      const granted = await navigator.storage.persist();
      setStorageStatus(granted ? 'granted' : 'best-effort');
      setMessage(granted ? 'Eviction protection was granted. Manually clearing browser data can still remove your library.' : 'This browser did not grant eviction protection. Your IndexedDB data is still saved; keep a downloaded backup.');
    } catch { setError('The browser could not request eviction protection. Keep a downloaded backup.'); }
  };
  return (
    <section className="backup-panel">
      <h3>Backups</h3>
      <p>{persistent ? 'Download a backup to move or recover your library.' : <><strong>Device storage is unavailable.</strong> Your changes are temporary. Export them before closing this tab.</>}</p>
      <div className="button-row"><button className="button button-dark" onClick={exportBackup} disabled={busy}><Icon name="download" width="17" height="17" />Export my library</button><button className="button button-outline" disabled={busy || reading} onClick={() => input.current?.click()}><Icon name="upload" width="17" height="17" />{reading ? 'Reading backup...' : 'Import backup'}</button></div>
      <input ref={input} className="sr-only" type="file" accept=".json,application/json" tabIndex={-1} aria-label="Import personal library backup file" onChange={(event) => { void readBackup(event.target.files?.[0]); }} />
      {incoming && <div className="restore-preview"><p><strong>{Object.keys(incoming.records).length} games, {incoming.queueOrder.length} queued, {incoming.ranking.length} ranked.</strong></p><p>Restoring replaces the active library and device preferences. {mode.scope !== 'guest' && 'This replacement will sync to the account if online saving is enabled. The guest library stays separate.'} Export your current library first if you want to keep both.</p><div className="button-row"><button className="button button-dark" disabled={busy} onClick={() => { void onRestore(incoming).then((success) => { if (success) { setIncoming(null); setMessage('Your backup was restored and saved in IndexedDB on this device.'); } else setError('Restore failed. Your existing library was not replaced.'); }); }}>Replace with this backup</button><button className="button button-outline" disabled={busy} onClick={() => setIncoming(null)}>Cancel import</button></div></div>}
      {persistent && <><p className="storage-info-line">{storageStatus === 'granted' ? 'Browser eviction protection is enabled.' : 'Storage can be removed by the browser or by clearing site data.'}</p>{storageStatus !== 'granted' && <button className="text-button" onClick={() => { void protectStorage(); }}>Ask browser to protect saved data<Icon name="arrow" width="16" height="16" /></button>}</>}
      {message && <p className="storage-info-line" role="status">{message}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </section>
  );
}
