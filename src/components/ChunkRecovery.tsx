import { useEffect, useRef, useState } from 'react';
import { guardedReload, offlineRecoveryMessage, unavailableRecoveryMessage } from '../lib/chunk-recovery';
import type { ChunkIntent } from '../lib/chunk-recovery';

export function ChunkRecovery({ message, intent, label = 'Reload this page' }: {
  message: string;
  intent?: ChunkIntent;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const active = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  return <div className="inline-error">
    <p role="alert">{message}</p>
    <p role="status">{notice}</p>
    <button className="text-button" aria-disabled={busy} aria-busy={busy} onClick={() => {
      if (pending.current) return;
      pending.current = true;
      setBusy(true);
      setNotice('Checking your connection…');
      void guardedReload({ intent, isCurrent: () => active.current }).then(result => {
        if (active.current) setNotice(result === 'offline' ? offlineRecoveryMessage : result === 'unavailable' ? unavailableRecoveryMessage : '');
      }).catch(error => {
        console.error('The requested reload could not start.', error);
        if (active.current) setNotice('This page could not reload. Use your browser to reload when connected.');
      }).finally(() => {
        pending.current = false;
        if (active.current) setBusy(false);
      });
    }}>{label}</button>
  </div>;
}
