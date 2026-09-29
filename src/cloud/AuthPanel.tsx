import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '../components/Icon';
import { EMULATOR_MODE } from '../lib/online-availability';
import type { AuthPurpose } from '../lib/sign-in-purpose';
import { DataUseLink } from '../components/DataUseLink';
import { GoogleMark } from './GoogleMark';
import { deviceLeftovers, retryDeviceLeftovers, useDeviceLeftovers } from './device-leftovers';

/** What each signed-out page is for and why it needs an account, above its sign-in choices. */
const pagePurposes: Record<Exclude<AuthPurpose, 'compare'>, string> = {
  account:
    'Sign in to save your games and rankings online and use them on your other devices. Your library stays on this device until you turn on online saving.',
  friends:
    'Add friends with an invite link, see the games they share and compare your rankings. Sign in so your friends can find you.',
  publish:
    'Publish your ranking as a public page that anyone with its link can see, and choose whether Community lists it. Sign in so the page belongs to you.',
  'friend-sharing':
    'Choose the ranked games, with their order and scores, that your friends can see. Sign in to share them with friends.',
  'friend-shelf': 'Choose saved games from your library for your friends to see. Sign in to share them with friends.',
};

/** After a sign-out and removal, or an account deletion, that left some of the account's data on this device. */
function DeviceLeftoverNotice() {
  const leftovers = useDeviceLeftovers();
  const notice = useRef<HTMLElement>(null);
  if (!leftovers) return null;
  const retry = () => {
    retryDeviceLeftovers();
    // Once a retry works its button goes: focus stays on the notice, which now confirms the removal.
    if (deviceLeftovers()?.state === 'removed') notice.current?.focus();
  };
  return (
    <section ref={notice} className="account-notice" role="alert" tabIndex={-1}>
      <p>
        {leftovers.state === 'removed'
          ? "That account's data is now removed from this device."
          : leftovers.after === 'sign-out'
            ? "Signed out, but some of this account's data is still on this device."
            : 'Your account is deleted, but some of its data is still on this device.'}
        {leftovers.state === 'still-left' &&
          " Trying again didn't work. To remove it, clear this site's data in your browser settings."}
      </p>
      {leftovers.state !== 'removed' && (
        <button className="button button-outline" type="button" onClick={retry}>
          Try again
        </button>
      )}
    </section>
  );
}

export function AuthPanel({
  busy,
  error,
  message,
  onGoogle,
  onEmail,
  onReset,
  onDevice,
  purpose,
  games,
}: {
  busy: boolean;
  error: string;
  message: string;
  purpose?: AuthPurpose;
  /** How many games the Compare tray holds, when the tray opened this sign-in. */
  games?: number;
  onGoogle: () => Promise<boolean>;
  onEmail: (email: string, password: string, create: boolean) => Promise<boolean>;
  onReset: (email: string) => Promise<boolean>;
  onDevice: () => void;
}) {
  const [emailMode, setEmailMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div className="auth-panel">
      <DeviceLeftoverNotice />
      {purpose === 'compare' ? (
        <section className="auth-purpose" aria-labelledby={`${id}-purpose`}>
          <h2 id={`${id}-purpose`}>Compare friends' rankings</h2>
          <p>
            {games
              ? `Sign in to compare your ${games === 1 ? 'pinned game' : `${games} pinned games`} with friends.`
              : 'Sign in to compare rankings shared by your friends.'}{' '}
            Pins select games for comparison; they do not share your library.
          </p>
        </section>
      ) : (
        purpose && (
          // The page's own heading names it; this says what it is for.
          <div className="auth-purpose">
            <p>{pagePurposes[purpose]}</p>
          </div>
        )
      )}
      {EMULATOR_MODE && (
        <p className="emulator-note">
          Local test preview: use synthetic accounts only. Authentication and cloud data stay in the local emulators.
        </p>
      )}
      <button
        className="google-signin"
        disabled={busy}
        onClick={() => {
          void onGoogle();
        }}
      >
        <GoogleMark />
        Continue with Google
      </button>
      {busy && (
        <p className="google-continuation" role="status">
          Connecting…
        </p>
      )}
      {!emailMode ? (
        <button
          className="button button-outline auth-email-toggle"
          onClick={() => {
            // The button leaves as the form replaces it; commit the form now, so focus moves to its Email field
            // instead of falling to the page.
            flushSync(() => setEmailMode(true));
            emailInput.current?.focus();
          }}
        >
          Use email
          <Icon name="arrow" width="18" height="18" />
        </button>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (resetMode) void onReset(email.trim());
            else void onEmail(email.trim(), password, creating);
          }}
        >
          <div className="auth-intent" role="group" aria-label="Email account action">
            <button
              type="button"
              aria-pressed={!creating && !resetMode}
              disabled={busy}
              onClick={() => {
                setCreating(false);
                setResetMode(false);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={creating && !resetMode}
              disabled={busy}
              onClick={() => {
                setCreating(true);
                setResetMode(false);
              }}
            >
              Create account
            </button>
          </div>
          <label htmlFor={`${id}-email`}>Email</label>
          <input
            ref={emailInput}
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
            maxLength={254}
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          {!resetMode && (
            <>
              <label htmlFor={`${id}-password`}>
                Password{creating && <span>At least 12 characters; a passphrase works well.</span>}
              </label>
              <div className="password-field">
                <input
                  id={`${id}-password`}
                  name="password"
                  type={revealed ? 'text' : 'password'}
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  required
                  minLength={creating ? 12 : undefined}
                  maxLength={4096}
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="text-button"
                  aria-label={revealed ? 'Hide password' : 'Show password'}
                  aria-pressed={revealed}
                  onClick={() => setRevealed((value) => !value)}
                >
                  {revealed ? 'Hide' : 'Show'}
                </button>
              </div>
            </>
          )}
          <button className="button button-dark auth-submit" disabled={busy} type="submit">
            {busy
              ? 'Please wait…'
              : resetMode
                ? 'Send reset email'
                : creating
                  ? 'Create account with email'
                  : 'Sign in with email'}
            <Icon name="arrow" width="18" height="18" />
          </button>
          {!creating && (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setResetMode((value) => !value);
                if (!email) emailInput.current?.focus();
              }}
            >
              {resetMode ? 'Back to sign in' : 'Reset password'}
            </button>
          )}
        </form>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="account-notice" role="status">
          {message}
        </p>
      )}
      <p className="account-privacy">
        Signing in does not publish your library. <DataUseLink />
      </p>
      <button className="text-button" onClick={onDevice} disabled={busy}>
        Keep using this device
        <Icon name="back" width="17" height="17" />
      </button>
    </div>
  );
}
