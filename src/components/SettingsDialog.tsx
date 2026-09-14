import { useState } from 'react';
import type { MotionPreference } from '../lib/types';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import type { PersonalLibraryState } from '../lib/personal-types';
import BackupPanel from './personal/BackupPanel';

interface SettingsDialogProps {
  motion: MotionPreference;
  reducedMotion: boolean;
  constrained: boolean;
  saved: number;
  completed: number;
  warning: string | null;
  onMotion: (value: MotionPreference) => void;
  onReset: () => Promise<boolean>;
  state: PersonalLibraryState;
  persistent: boolean;
  busy: boolean;
  onRestore: (state: PersonalLibraryState) => Promise<boolean>;
  onAbout: () => void;
  onClose: () => void;
}

export function SettingsDialog({ motion, reducedMotion, constrained, saved, completed, warning, onMotion, onReset, onClose, state, persistent, busy, onRestore, onAbout }: SettingsDialogProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  return (
    <Dialog open titleId="settings-title" onClose={onClose} className="info-dialog settings-dialog">
      <h2 id="settings-title" data-autofocus tabIndex={-1}>Make it<br />your speed.</h2>
      <p className="dialog-lead">Your collection, your preferences, your saved data.</p>
      <fieldset className="motion-options">
        <legend>Visual experience</legend>
        {([
          ['auto', 'Auto', 'Touchscreens start 3D on demand.'],
          ['full', 'Full', 'The interactive 3D collection.'],
          ['lite', 'Lite', 'Original static art. No effects.'],
        ] as const).map(([value, label, description]) => (
          <label key={value} className={`motion-option ${motion === value ? 'selected' : ''}`}>
            <input type="radio" name="visual-experience" value={value} checked={motion === value} disabled={busy} onChange={() => onMotion(value)} />
            <span><strong>{label}</strong><small>{description}</small></span>
          </label>
        ))}
      </fieldset>
      {reducedMotion ? <p className="preference-note"><Icon name="info" />Your system requests reduced motion. Static art is used in every mode, even Full.</p> : constrained && motion === 'auto' ? <p className="preference-note"><Icon name="info" />Auto is using static art because this browser reports limited device resources or data saving.</p> : <p className="section-help">Auto uses available device and connection hints. Offscreen and hidden-tab animation stops. Full still respects your system's reduced-motion setting.</p>}
      <BackupPanel state={state} busy={busy} persistent={persistent} onRestore={onRestore} />
      <section className="device-settings">
        <h3>Only on this device</h3>
        <p>{saved} saved for later. {completed} marked completed.</p>
        <p>No account, cloud backup or sync. Clearing this browser's site data also clears this list. Saving and completion are independent, so a favorite can stay on your replay list.</p>
        {warning && <p className="storage-warning" role="alert">{warning}</p>}
        {confirmReset ? (
          <div className="reset-confirmation">
            <p><strong>Reset this browser's library, queue, personal rankings and preferences?</strong> This cannot be undone. Export a backup first if needed. The public collection is not affected.</p>
            <div className="button-row"><button className="button button-danger" disabled={busy} onClick={() => { void onReset().then((success) => { setConfirmReset(false); setResetMessage(success ? 'Your device list and preferences have been reset.' : 'Reset failed. Your saved data has not been removed.'); }); }}>Yes, reset device data</button><button className="button button-outline" disabled={busy} onClick={() => setConfirmReset(false)}>Keep my data</button></div>
          </div>
        ) : <button className="text-button danger-text" onClick={() => setConfirmReset(true)}>Reset device data</button>}
        {resetMessage && <p role="status">{resetMessage}</p>}
      </section>
      <button className="text-button" onClick={onAbout}>Source, methodology &amp; credits<Icon name="arrow" width="17" height="17" /></button>
    </Dialog>
  );
}
