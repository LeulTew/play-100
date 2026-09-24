import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MotionPreference } from '../lib/types';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import type { PersonalLibraryState } from '../lib/personal-types';
import BackupPanel from './personal/BackupPanel';
import { useLibraryMode } from '../lib/library-mode';
import './settings-controls.css';

interface SettingsDialogProps {
  motion: MotionPreference;
  reducedMotion: boolean;
  constrained: boolean;
  saved: number;
  completed: number;
  warning: string | null;
  onMotion: (value: MotionPreference) => Promise<boolean>;
  onReset: () => Promise<boolean>;
  state: PersonalLibraryState;
  persistent: boolean;
  busy: boolean;
  onRestore: (state: PersonalLibraryState) => Promise<boolean>;
  onAbout: () => void;
  onAccount?: () => void;
  onClose: () => void;
  offlineControls?: ReactNode;
  status?: string;
  statusError?: boolean;
  recovery?: ReactNode;
  getReturnFocus?: () => HTMLElement | null;
}

export function SettingsDialog({ motion, reducedMotion, constrained, saved, completed, warning, onMotion, onReset, onClose, state, persistent, busy, onRestore, onAbout, onAccount, offlineControls, status = '', statusError = false, recovery, getReturnFocus }: SettingsDialogProps) {
  const motionId = useId();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [pendingMotion, setPendingMotion] = useState<MotionPreference | null>(null);
  const [motionFailed, setMotionFailed] = useState(false);
  const savingMotion = useRef(false);
  const queued = useRef<MotionPreference | null>(null);
  const saving = pendingMotion !== null;
  const selectedMotion = pendingMotion ?? motion;
  const changeMotion = async (value: MotionPreference) => {
    if (savingMotion.current) {
      queued.current = value;
      setPendingMotion(value);
      return;
    }
    if (busy || value === motion) return;
    savingMotion.current = true;
    queued.current = value;
    setPendingMotion(value);
    setMotionFailed(false);
    try {
      let next = value;
      while (true) {
        if (!await onMotion(next)) {
          setMotionFailed(true);
          break;
        }
        const latest = queued.current;
        if (latest === null || latest === next) break;
        next = latest;
      }
    } catch (error: unknown) {
      console.error('The visual experience preference could not be saved.', error);
      setMotionFailed(true);
    } finally {
      queued.current = null;
      savingMotion.current = false;
      setPendingMotion(null);
    }
  };
  const mode = useLibraryMode();
  return (
    <Dialog open titleId="settings-title" onClose={onClose} getReturnFocus={getReturnFocus} className="info-dialog settings-dialog" motion={{ preset: 'dialog', enterMs: 160 }}>
      <h2 id="settings-title" data-autofocus tabIndex={-1}>Make it<br />your speed.</h2>
      <p className="dialog-lead">Your collection, your preferences, your saved data.</p>
      <div role="status">{status && !recovery && <p className={status && statusError ? 'inline-error' : undefined}>{status}</p>}{motionFailed && <p className="inline-error">Your visual experience could not be saved. The saved preference is still selected. Please try again.</p>}</div>
      {recovery}
      {onAccount && <div className="settings-account"><p><strong>{mode.label}</strong>{mode.scope === 'guest' ? ' — this guest library has not been uploaded.' : ' — you are using a separate account library.'}</p><button className="text-button" onClick={onAccount}>Account, saving &amp; privacy<Icon name="user" width="18" height="18" /></button></div>}
      {offlineControls}
      <fieldset className="motion-options">
        <legend>Visual experience</legend>
        {([
          ['auto', 'Auto', 'Touchscreens start 3D on demand.'],
          ['full', 'Full', 'The interactive 3D collection.'],
          ['lite', 'Lite', 'Original static art. No effects.'],
        ] as const).map(([value, label, description]) => (
          <label key={value} className={`motion-option ${selectedMotion === value ? 'selected' : ''}`}>
            <input type="radio" name="visual-experience" aria-labelledby={`${motionId}-${value}-label`} aria-describedby={`${motionId}-${value}-description`} value={value} checked={selectedMotion === value} disabled={busy && !saving} onChange={() => { void changeMotion(value); }} />
            <span><strong id={`${motionId}-${value}-label`}>{label}</strong><small id={`${motionId}-${value}-description`}>{description}</small></span>
          </label>
        ))}
      </fieldset>
      {reducedMotion ? <p className="preference-note"><Icon name="info" />Your system requests reduced motion. Static art is used in every mode, even Full.</p> : constrained && motion === 'auto' ? <p className="preference-note"><Icon name="info" />Auto is using static art because this browser reports limited device resources or data saving.</p> : <p className="section-help">Auto uses available device and connection hints. Offscreen and hidden-tab animation stops. Full still respects your system's reduced-motion setting.</p>}
      <BackupPanel state={state} busy={busy} persistent={persistent} onRestore={onRestore} />
      <section className="device-settings">
        <h3>{mode.scope === 'guest' ? 'Only on this device' : 'This account library'}</h3>
        <p>{saved} saved for later. {completed} marked completed.</p>
        <p>{mode.scope === 'guest' ? 'This guest copy is device-only. Online saving is optional and requires a separate sign-in and consent. Clearing site data can remove this local copy.' : 'Account edits save locally first and upload only while online saving is enabled. Sign out to return to the untouched guest library; manage cloud deletion from Account.'} Saving and completion are independent, so a favorite can stay on your replay list.</p>
        {warning && <p className="storage-warning" role="alert">{warning}</p>}
        {confirmReset ? (
          <div className="reset-confirmation">
            <p><strong>Reset the active library, queue, personal rankings and preferences?</strong> {mode.scope !== 'guest' && 'If online saving is enabled, this empty account library will sync online. The guest library stays untouched.'} This cannot be undone. Export a backup first if needed. The public collection is not affected.</p>
            <div className="button-row"><button className="button button-danger" disabled={busy} onClick={() => { void onReset().then((success) => { setConfirmReset(false); setResetMessage(success ? 'Your device list and preferences have been reset.' : 'Reset failed. Your saved data has not been removed.'); }); }}>{mode.scope === 'guest' ? 'Yes, reset device data' : 'Yes, reset this account library'}</button><button className="button button-outline" disabled={busy} onClick={() => setConfirmReset(false)}>Keep my data</button></div>
          </div>
        ) : <button className="text-button danger-text" onClick={() => setConfirmReset(true)}>{mode.scope === 'guest' ? 'Reset device data' : 'Reset this account library'}</button>}
        {resetMessage && <p role="status">{resetMessage}</p>}
      </section>
      <button className="text-button" onClick={onAbout}>Source, methodology &amp; credits<Icon name="arrow" width="17" height="17" /></button>
    </Dialog>
  );
}
