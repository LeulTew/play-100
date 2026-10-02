import { useState } from 'react';
import { PWA_IOS_INSTRUCTIONS } from '../pwa';
import type { usePwa } from '../pwa';
import './settings-controls.css';

export default function PwaControls({
  pwa,
  open = false,
  onUpdate,
}: {
  pwa: ReturnType<typeof usePwa>;
  open?: boolean;
  onUpdate: () => Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [recovering, setRecovering] = useState(false);
  const pending = pwa.offlineState === 'preparing' || pwa.updateState === 'applying' || pwa.checkingUpdate === true;
  return (
    <details className="device-settings pwa-settings" open={open}>
      <summary>Install &amp; offline access</summary>
      <p>Keep The 100 and this device's library available offline.</p>
      <p>
        Account services and online game searches need a connection. Offline preparation downloads public files, not
        private or account data.
      </p>
      {pwa.installState === 'installed' ? (
        <p role="status">Running as an installed app.</p>
      ) : pwa.installState === 'ios-instructions' ? (
        <p>{PWA_IOS_INSTRUCTIONS}</p>
      ) : pwa.installState === 'prompt' ? (
        <button
          className="button button-dark"
          onClick={() => {
            void pwa.install();
          }}
        >
          Install Play 100
        </button>
      ) : (
        <p>No install prompt is available here. Look for Install or Add to Home Screen in your browser.</p>
      )}
      <div className="button-row">
        {/* A press that starts preparation or a check keeps focus on its button: aria-disabled and a guarded
            handler, not disabled, while the work it started runs (UX-013). Offline, the controls are disabled. */}
        <button
          className="button button-outline"
          disabled={!pwa.online}
          aria-disabled={pending || pwa.offlineState === 'ready' || undefined}
          onClick={() => {
            if (pending || pwa.offlineState === 'ready') return;
            void pwa.prepareOffline();
          }}
        >
          {pwa.offlineState === 'ready'
            ? 'Offline files ready'
            : pwa.offlineState === 'preparing'
              ? 'Preparing offline files…'
              : 'Enable offline access'}
        </button>
        {pwa.offlineState === 'ready' && (
          <button
            className="text-button"
            disabled={!pwa.online}
            aria-disabled={pending || undefined}
            aria-busy={pwa.checkingUpdate === true}
            onClick={() => {
              if (pending) return;
              void pwa.checkForUpdate();
            }}
          >
            {pwa.checkingUpdate ? 'Checking for an update…' : 'Check for an app update'}
          </button>
        )}
      </div>
      <p className="section-help">
        Offline files are stored within your browser's storage limits. Workbooks, films and online-only pages are not
        downloaded for offline use.
      </p>
      <div role="status">{pwa.message && <p>{pwa.message}</p>}</div>
      {pwa.error && !pwa.moduleError && (
        <p className="inline-error" role="alert">
          {pwa.error}
        </p>
      )}
      {pwa.moduleError && (
        <div className="inline-error" role="alert">
          <p>{pwa.error}</p>
          <button
            className="text-button"
            disabled={recovering}
            aria-busy={recovering}
            onClick={() => {
              setRecovering(true);
              void onUpdate()
                .catch((cause) => {
                  console.error('The requested reload could not start.', cause);
                  setUpdateError('This page could not reload. Save your changes before reloading when connected.');
                })
                .finally(() => setRecovering(false));
            }}
          >
            {recovering ? 'Checking your connection…' : 'Reload this page'}
          </button>
        </div>
      )}
      {updateError && (
        <p className="inline-error" role="alert">
          {updateError}
        </p>
      )}
      {!pwa.moduleError &&
        (pwa.updateState === 'waiting' || pwa.updateState === 'reload-required') &&
        (confirm ? (
          <div className="reset-confirmation" role="group" aria-label="Confirm app update">
            <p>
              Updating reloads this page. Finish or clear unsubmitted forms first. It saves your ratings and notes
              before reloading, and stops if you edit, change page or have Play 100 open in another window.
            </p>
            <div className="button-row">
              <button className="button button-outline" autoFocus onClick={() => setConfirm(false)}>
                Keep this version open
              </button>
              <button
                className="button button-dark"
                disabled={pending}
                onClick={() => {
                  setUpdateError('');
                  void onUpdate()
                    .then(() => setConfirm(false))
                    .catch((cause) => {
                      console.error(
                        'The requested app update could not finish.',
                        cause instanceof Error ? cause.message : 'Unknown update error.',
                      );
                      setUpdateError('The requested update could not finish. Your page was not reloaded.');
                      setConfirm(false);
                    });
                }}
              >
                Save and update this page
              </button>
            </div>
          </div>
        ) : (
          <button className="button button-dark" onClick={() => setConfirm(true)}>
            Review app update
          </button>
        ))}
    </details>
  );
}
