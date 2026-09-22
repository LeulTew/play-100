import { useState } from 'react';
import { PWA_IOS_INSTRUCTIONS } from '../pwa';
import type { usePwa } from '../pwa';
import './pwa-controls.css';

export default function PwaControls({ pwa, open = false, onUpdate }: {
  pwa: ReturnType<typeof usePwa>;
  open?: boolean;
  onUpdate: () => Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const pending = pwa.offlineState === 'preparing' || pwa.updateState === 'applying';
  return <details className="device-settings pwa-settings" open={open}>
    <summary>Install &amp; offline access</summary>
    <p>Keep the public collection and this device's library available without a connection.
      Account services and live catalog details still need the internet. No private or account responses are stored by the offline worker.</p>
    {pwa.installState === 'installed' ? <p role="status">Running as an installed app.</p>
      : pwa.installState === 'ios-instructions' ? <p>{PWA_IOS_INSTRUCTIONS}</p>
        : pwa.installState === 'prompt' ? <button className="button button-dark" onClick={() => { void pwa.install(); }}>Install Play 100</button>
          : <p>Use your browser's Install or Add to Home Screen option when available. This browser has not offered an in-page install prompt.</p>}
    <div className="button-row">
      <button className="button button-outline" disabled={!pwa.online || pending || pwa.offlineState === 'ready'}
        onClick={() => { void pwa.prepareOffline(); }}>
        {pwa.offlineState === 'ready' ? 'Offline files ready' : pwa.offlineState === 'preparing' ? 'Preparing offline files...' : 'Enable offline access'}
      </button>
      {pwa.offlineState === 'ready' && <button className="text-button" disabled={!pwa.online || pending}
        onClick={() => { void pwa.checkForUpdate(); }}>Check for an app update</button>}
    </div>
    <p className="section-help">Public code, metadata and recently viewed bundled artwork use bounded storage.
      Workbooks, films, cloud pages and live-provider responses are not downloaded for offline use.</p>
    {pwa.message && <p role="status" aria-live="polite">{pwa.message}</p>}
    {pwa.error && <p className="inline-error" role="alert">{pwa.error}</p>}
    {updateError && <p className="inline-error" role="alert">{updateError}</p>}
    {(pwa.updateState === 'waiting' || pwa.updateState === 'reload-required') && (confirm
      ? <div className="reset-confirmation" role="group" aria-label="Confirm app update">
        <p>Updating reloads this page. Finish or clear unsubmitted forms first. Pending ratings and notes must save successfully;
          a new edit, changed page or another open Play 100 window prevents this reload.</p>
        <div className="button-row">
          <button className="button button-outline" autoFocus onClick={() => setConfirm(false)}>Keep this version open</button>
          <button className="button button-dark" disabled={pending} onClick={() => {
            setUpdateError('');
            void onUpdate().then(() => setConfirm(false)).catch(cause => {
              console.error('App update controls could not load.', cause instanceof Error ? cause.message : 'Unknown update error.');
              setUpdateError('Update controls could not load. Your page was not reloaded. Reconnect and retry.');
              setConfirm(false);
            });
          }}>Save and update this page</button>
        </div>
      </div>
      : <button className="button button-dark" onClick={() => setConfirm(true)}>Review app update</button>)}
  </details>;
}
