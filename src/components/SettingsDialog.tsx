import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MotionPreference } from '../lib/types';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import type { PersonalLibraryState } from '../lib/personal-types';
import BackupPanel from './personal/BackupPanel';
import { useLibraryMode } from '../lib/library-mode';
import { foregroundDialog } from './dialog-layer';
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

export function SettingsDialog({
  motion,
  reducedMotion,
  constrained,
  saved,
  completed,
  warning,
  onMotion,
  onReset,
  onClose,
  state,
  persistent,
  busy,
  onRestore,
  onAbout,
  onAccount,
  offlineControls,
  status = '',
  statusError = false,
  recovery,
  getReturnFocus,
}: SettingsDialogProps) {
  const motionId = useId();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetResult, setResetResult] = useState<'saved' | 'failed' | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const resetting = useRef(false);
  const resetTrigger = useRef<HTMLButtonElement>(null);
  const keepData = useRef<HTMLButtonElement>(null);
  const resetFocusRequested = useRef(false);
  useLayoutEffect(() => {
    if (!resetFocusRequested.current) return;
    resetFocusRequested.current = false;
    const target = confirmReset ? keepData.current : resetTrigger.current;
    if (!target || target.closest('dialog') !== foregroundDialog()) return;
    if (confirmReset)
      target
        .closest('.reset-confirmation')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    target.focus({ preventScroll: true });
  }, [confirmReset]);
  const closeReset = () => {
    resetFocusRequested.current = true;
    setConfirmReset(false);
  };
  const reset = async () => {
    if (busy || resetting.current) return;
    resetting.current = true;
    setResetPending(true);
    try {
      setResetResult((await onReset()) ? 'saved' : 'failed');
    } catch (error: unknown) {
      console.error('The active library could not be reset.', error);
      setResetResult('failed');
    } finally {
      resetting.current = false;
      setResetPending(false);
      closeReset();
    }
  };
  const [pendingMotion, setPendingMotion] = useState<MotionPreference | null>(null);
  const [motionFeedback, setMotionFeedback] = useState<'saved' | 'failed' | null>(null);
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
    setMotionFeedback(null);
    try {
      let next = value;
      while (true) {
        if (!(await onMotion(next))) {
          setMotionFeedback('failed');
          break;
        }
        const latest = queued.current;
        if (latest === null || latest === next) {
          setMotionFeedback('saved');
          break;
        }
        next = latest;
      }
    } catch (error: unknown) {
      console.error('The visual experience preference could not be saved.', error);
      setMotionFeedback('failed');
    } finally {
      queued.current = null;
      savingMotion.current = false;
      setPendingMotion(null);
    }
  };
  const mode = useLibraryMode();
  return (
    <Dialog
      open
      titleId="settings-title"
      onClose={onClose}
      getReturnFocus={getReturnFocus}
      className="info-dialog settings-dialog"
      motion={{ preset: 'dialog', enterMs: 160 }}
    >
      <h2 id="settings-title" data-autofocus tabIndex={-1}>
        Settings &amp; backups
      </h2>
      <p className="dialog-lead">Backups, offline access and display settings for this device.</p>
      <div role="status">
        {status && !recovery && <p className={status && statusError ? 'inline-error' : undefined}>{status}</p>}
        {motionFeedback && (
          <p className={motionFeedback === 'failed' ? 'inline-error' : undefined}>
            {motionFeedback === 'failed'
              ? 'Your visual experience could not be saved. The saved preference is still selected. Please try again.'
              : `Visual preference saved.${persistent ? '' : ' This tab only: export a backup to keep it.'}`}
          </p>
        )}
      </div>
      {recovery}
      {onAccount && (
        <div className="settings-account">
          <p>
            <strong>{mode.label}</strong>
            {mode.scope === 'guest'
              ? ' — this guest library has not been uploaded.'
              : ' — you are using a separate account library.'}
          </p>
          <button className="text-button" onClick={onAccount}>
            Account, saving &amp; privacy
            <Icon name="user" width="18" height="18" />
          </button>
        </div>
      )}
      {offlineControls}
      <BackupPanel
        state={state}
        busy={busy}
        persistent={persistent}
        onRestore={onRestore}
        onActionStart={() => setResetResult(null)}
      />
      <fieldset className="motion-options">
        <legend>Visual experience</legend>
        {(
          [
            ['auto', 'Auto', 'Touchscreens start 3D on demand.'],
            ['full', 'Full', 'The interactive 3D collection.'],
            ['lite', 'Lite', 'Original static art. No effects.'],
          ] as const
        ).map(([value, label, description]) => (
          <label key={value} className={`motion-option ${selectedMotion === value ? 'selected' : ''}`}>
            <input
              type="radio"
              name="visual-experience"
              aria-labelledby={`${motionId}-${value}-label`}
              aria-describedby={`${motionId}-${value}-description`}
              value={value}
              checked={selectedMotion === value}
              disabled={busy && !saving}
              onChange={() => {
                void changeMotion(value);
              }}
            />
            <span>
              <strong id={`${motionId}-${value}-label`}>{label}</strong>
              <small id={`${motionId}-${value}-description`}>{description}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {reducedMotion ? (
        <p className="preference-note">
          <Icon name="info" />
          Your system requests reduced motion. Static art is used in every mode, even Full.
        </p>
      ) : constrained && motion === 'auto' ? (
        <p className="preference-note">
          <Icon name="info" />
          Auto is using static art because this browser reports limited device resources or data saving.
        </p>
      ) : (
        <p className="section-help">
          Auto uses available device and connection hints. Offscreen and hidden-tab animation stops. Full still respects
          your system's reduced-motion setting.
        </p>
      )}
      <section className="device-settings">
        <h3>{mode.scope === 'guest' ? 'Only on this device' : 'This account library'}</h3>
        <p>
          {saved} in Play later · {completed} completed.
        </p>
        <p>
          {mode.scope === 'guest'
            ? 'This guest copy is device-only. Online saving is optional and requires a separate sign-in and consent. Clearing site data can remove this local copy.'
            : 'Account edits save locally first and upload only while online saving is enabled. Sign out to return to the untouched guest library; manage cloud deletion from Account.'}{' '}
          Completed games can stay in Play later for a replay.
        </p>
        {warning && (
          <p className="storage-warning" role="alert">
            {warning}
          </p>
        )}
        {confirmReset ? (
          <div className="reset-confirmation" role="group" aria-labelledby={`${motionId}-reset`}>
            <p id={`${motionId}-reset`}>
              <strong>Reset the active library, Play later, personal rankings and preferences?</strong>{' '}
              {mode.scope !== 'guest' &&
                'If online saving is enabled, this empty account library will sync online. The guest library stays untouched.'}{' '}
              This cannot be undone. Export a backup first if needed. The public collection is not affected.
            </p>
            <div className="button-row">
              <button
                className="button button-danger"
                aria-disabled={busy || resetPending || undefined}
                onClick={() => {
                  void reset();
                }}
              >
                {mode.scope === 'guest' ? 'Yes, reset device data' : 'Yes, reset this account library'}
              </button>
              <button
                ref={keepData}
                className="button button-outline"
                aria-disabled={busy || resetPending || undefined}
                onClick={() => {
                  if (!busy && !resetting.current) closeReset();
                }}
              >
                Keep my data
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={resetTrigger}
            className="text-button danger-text"
            aria-disabled={busy || undefined}
            onClick={() => {
              if (busy) return;
              resetFocusRequested.current = true;
              setResetResult(null);
              setConfirmReset(true);
            }}
          >
            {mode.scope === 'guest' ? 'Reset device data' : 'Reset this account library'}
          </button>
        )}
        {resetResult && (
          <p role={resetResult === 'failed' ? 'alert' : 'status'}>
            {resetResult === 'saved'
              ? 'Your active library, Play later, ranking and preferences have been reset.'
              : 'Reset failed. Your saved data has not been removed.'}
          </p>
        )}
      </section>
      <button className="text-button" onClick={onAbout}>
        Source, methodology &amp; credits
        <Icon name="arrow" width="17" height="17" />
      </button>
    </Dialog>
  );
}
