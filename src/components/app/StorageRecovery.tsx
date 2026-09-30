import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { focusPendingEditor, visibleFocusTarget } from '../../lib/dialog-focus';
import { foregroundDialog } from '../dialog-layer';
export interface GlobalBannersProps {
  warning: string | null;
  onlineConfigError: string | null;
  offline: boolean;
  offlineReady: boolean;
  hintError: string;
  hintBlocked?: boolean;
  onSettings: () => void;
  onAccount: () => void;
  onDeviceOnly: () => void;
  onRetryLibrary?: () => Promise<boolean>;
  retryBusy?: boolean;
  captureRetryFocus?: () => () => boolean;
  onDiscardTemporary?: (revision: number) => Promise<boolean>;
  temporaryRevision?: number;
}

export default function StorageRecovery({
  warning,
  hintError,
  hintBlocked = false,
  onSettings,
  onRetryLibrary,
  retryBusy = false,
  captureRetryFocus,
  onDiscardTemporary,
  temporaryRevision = 0,
}: GlobalBannersProps) {
  const [retryWarning, setRetryWarning] = useState<string | null>(null);
  const storageWarning = warning ?? (hintBlocked ? hintError : null) ?? (retryBusy ? retryWarning : null);
  if (retryWarning && !retryBusy && !storageWarning) setRetryWarning(null);
  const [discardRevision, setDiscardRevision] = useState<number | null>(null);
  const discardTrigger = useRef<HTMLButtonElement>(null);
  const keepChanges = useRef<HTMLButtonElement>(null);
  if (discardRevision !== null && !retryBusy && (!onDiscardTemporary || !storageWarning)) setDiscardRevision(null);
  useLayoutEffect(() => {
    if (discardRevision !== null) focusPendingEditor(keepChanges.current);
  }, [discardRevision]);
  const retryRef = useCallback(
    (button: HTMLButtonElement | null) => {
      if (!button) return;
      return () => {
        if (document.activeElement !== button) return;
        const isCurrent = captureRetryFocus?.();
        queueMicrotask(() => {
          if (
            button.isConnected ||
            (document.activeElement !== document.body && document.activeElement !== button) ||
            isCurrent?.() === false ||
            foregroundDialog()
          )
            return;
          const target = [
            ...document.querySelectorAll<HTMLElement>('#page-main [data-page-heading], #collection-title'),
          ].find(visibleFocusTarget);
          if (target) focusPendingEditor(target);
        });
      };
    },
    [captureRetryFocus],
  );
  return (
    <>
      {storageWarning && (
        <div className="global-storage">
          <div className="storage-banner" role="alert">
            <Icon name="info" />
            <p>{storageWarning}</p>
            {onRetryLibrary && (
              <button
                ref={retryRef}
                type="button"
                className="text-button"
                aria-disabled={retryBusy || undefined}
                aria-busy={retryBusy}
                onClick={() => {
                  if (!retryBusy) {
                    setRetryWarning(storageWarning);
                    void onRetryLibrary();
                  }
                }}
              >
                Try again
              </button>
            )}
            <button className="text-button" onClick={onSettings}>
              Settings
              <Icon name="arrow" width="18" height="18" />
            </button>
          </div>
          {(onDiscardTemporary || (retryBusy && discardRevision !== null)) && (
            <div className="reset-confirmation" role="group" aria-label="Temporary library recovery">
              <button
                ref={discardTrigger}
                type="button"
                className="text-button"
                aria-expanded={discardRevision !== null}
                aria-disabled={retryBusy || undefined}
                onClick={() => {
                  if (!retryBusy) setDiscardRevision(temporaryRevision);
                }}
              >
                Discard tab changes and try again
              </button>
              {discardRevision !== null && (
                <>
                  <p>
                    Export a backup in Settings first. If reopening succeeds, only changes made in this tab while device
                    storage was unavailable will be discarded, including temporary games, progress, ratings and notes.
                    Your previously saved library and other tabs are not changed. If storage is still blocked, this
                    tab's changes stay here.
                  </p>
                  <div className="button-row">
                    <button
                      ref={keepChanges}
                      type="button"
                      className="button button-outline"
                      aria-disabled={retryBusy || undefined}
                      onClick={() => {
                        if (retryBusy) return;
                        setDiscardRevision(null);
                        focusPendingEditor(discardTrigger.current);
                      }}
                    >
                      Keep tab changes
                    </button>
                    <button
                      ref={retryRef}
                      type="button"
                      className="button button-danger"
                      aria-disabled={retryBusy || undefined}
                      aria-busy={retryBusy}
                      onClick={() => {
                        if (!retryBusy && onDiscardTemporary) {
                          setRetryWarning(storageWarning);
                          void onDiscardTemporary(discardRevision);
                        }
                      }}
                    >
                      Discard and try again
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
