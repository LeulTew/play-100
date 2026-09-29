import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { hasStorageSafetyNotice, STORAGE_DENIED_MESSAGE } from '../../lib/storage-notices';
import { focusPendingEditor, visibleFocusTarget } from '../../lib/dialog-focus';
import { foregroundDialog } from '../dialog-layer';

export interface GlobalBannersProps {
  warning: string | null;
  onlineConfigError: string | null;
  offline: boolean;
  offlineReady: boolean;
  hintError: string;
  onSettings: () => void;
  onAccount: () => void;
  onDeviceOnly: () => void;
  onRetryLibrary?: () => Promise<boolean>;
  retryBusy?: boolean;
  captureRetryFocus?: () => () => boolean;
  onDiscardTemporary?: (revision: number) => Promise<boolean>;
  temporaryRevision?: number;
}

export function GlobalBanners({
  warning,
  onlineConfigError,
  offline,
  offlineReady,
  hintError,
  onSettings,
  onAccount,
  onDeviceOnly,
  onRetryLibrary,
  retryBusy = false,
  captureRetryFocus,
  onDiscardTemporary,
  temporaryRevision = 0,
}: GlobalBannersProps) {
  const [discardRevision, setDiscardRevision] = useState<number | null>(null);
  const discardTrigger = useRef<HTMLButtonElement>(null);
  const keepChanges = useRef<HTMLButtonElement>(null);
  if (discardRevision !== null && (!onDiscardTemporary || !warning)) setDiscardRevision(null);
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
  const sharedDenial =
    hintError === STORAGE_DENIED_MESSAGE && (warning === hintError || Boolean(warning?.startsWith(`${hintError} `)));
  const accountActions = (
    <>
      <button className="text-button" onClick={onAccount}>
        Open Account
      </button>
      <button className="text-button" onClick={onDeviceOnly}>
        Use this device only
      </button>
    </>
  );
  const accountChoice = 'Choose an account check or continue with this device explicitly.';
  return (
    <>
      {warning && (
        <div className="global-storage">
          <div className="storage-banner" role="alert">
            <Icon name="info" />
            <p>
              {warning}
              {sharedDenial && ` ${accountChoice}`}
            </p>
            {onRetryLibrary && (
              <button
                ref={retryRef}
                type="button"
                className="text-button"
                aria-disabled={retryBusy || undefined}
                aria-busy={retryBusy}
                onClick={() => {
                  if (!retryBusy) void onRetryLibrary();
                }}
              >
                Try again
              </button>
            )}
            <button className="text-button" onClick={onSettings}>
              Settings
              <Icon name="arrow" width="18" height="18" />
            </button>
            {sharedDenial && accountActions}
          </div>
          {onDiscardTemporary && (
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
                        if (!retryBusy) void onDiscardTemporary(discardRevision);
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
      {onlineConfigError && (
        <div className="global-storage">
          <div className="storage-banner" role="alert">
            <Icon name="info" />
            <p>{onlineConfigError}</p>
          </div>
        </div>
      )}
      {offline && (
        <div className="global-storage">
          <div className="storage-banner" role="status">
            <Icon name="info" />
            <p>
              You are offline.{' '}
              {offlineReady
                ? 'Prepared app files and saved device games can work offline.'
                : 'The loaded page and saved device games can still work. Enable offline access in Settings when connected.'}{' '}
              Online saving and live lookups need a connection.
            </p>
          </div>
        </div>
      )}
      {hintError && !sharedDenial && (
        <div className="global-storage">
          <div className="storage-banner" role="alert">
            <Icon name="info" />
            <p>
              {hintError}
              {!hasStorageSafetyNotice(hintError) && ' Your libraries have not been cleared.'} {accountChoice}
            </p>
            {accountActions}
          </div>
        </div>
      )}
    </>
  );
}
