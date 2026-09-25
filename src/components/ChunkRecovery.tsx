import { useContext, useEffect, useRef, useState } from 'react';
import {
  guardedReload,
  offlineRecoveryMessage,
  unavailableRecoveryMessage,
  unsavedRecoveryMessage,
} from '../lib/chunk-recovery';
import type { ChunkIntent } from '../lib/chunk-recovery';
import { ReloadGuardContext } from '../lib/reload-guard-context';
import { createPwaUpdateGuard, useInputGeneration } from '../pwa/update-guard';

export function ChunkRecovery({
  message,
  intent,
  label = 'Reload this page',
  onKeepEditing,
}: {
  message: string;
  intent?: ChunkIntent;
  label?: string;
  onKeepEditing?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState(false);
  const active = useRef(false);
  const pending = useRef(false);
  const captureGuard = useContext(ReloadGuardContext);
  const standaloneInput = useInputGeneration(!captureGuard);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <div className="inline-error">
      <p role="alert">{message}</p>
      <p role="status">{notice}</p>
      <button
        type="button"
        className="text-button"
        aria-disabled={busy}
        aria-busy={busy}
        onClick={() => {
          if (pending.current) return;
          pending.current = true;
          setBlocked(false);
          setBusy(true);
          setNotice('Checking saved work and your connection…');
          const guard =
            captureGuard?.() ??
            createPwaUpdateGuard({
              isCurrent: () => active.current,
              busy: () => false,
              inputGeneration: standaloneInput,
            });
          void guardedReload({ intent, guard, isCurrent: () => active.current })
            .then((result) => {
              if (active.current) {
                const kept = result === 'blocked' || result === 'cancelled';
                setBlocked(kept);
                setNotice(
                  kept
                    ? unsavedRecoveryMessage
                    : result === 'offline'
                      ? offlineRecoveryMessage
                      : result === 'unavailable'
                        ? unavailableRecoveryMessage
                        : '',
                );
              }
            })
            .catch((error) => {
              console.error('The requested reload could not start.', error);
              if (active.current) {
                setBlocked(true);
                setNotice(unsavedRecoveryMessage);
              }
            })
            .finally(() => {
              pending.current = false;
              if (active.current) setBusy(false);
            });
        }}
      >
        {label}
      </button>
      {blocked && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setBlocked(false);
            setNotice('Reload cancelled. Your work is unchanged.');
            onKeepEditing?.();
          }}
        >
          Keep editing
        </button>
      )}
    </div>
  );
}
