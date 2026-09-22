import { useId, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { EMULATOR_MODE } from '../lib/online-availability';
import { DataUseLink } from '../components/DataUseLink';

export function AuthPanel({ busy, error, message, onGoogle, onEmail, onReset, onDevice, purpose }: {
  busy: boolean; error: string; message: string;
  purpose?: 'compare';
  onGoogle: () => Promise<boolean>; onEmail: (email: string, password: string, create: boolean) => Promise<boolean>;
  onReset: (email: string) => Promise<boolean>; onDevice: () => void;
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
      {purpose === 'compare' && <section className="auth-purpose" aria-labelledby={`${id}-purpose`}>
        <h2 id={`${id}-purpose`}>Compare friends' rankings</h2>
        <p>Sign in to compare rankings shared by your friends. Pins select games for comparison; they do not share your library.</p>
      </section>}
      {EMULATOR_MODE && <p className="emulator-note">Local test preview: use synthetic accounts only. Authentication and cloud data stay in the local emulators.</p>}
      <button className="google-signin" disabled={busy} onClick={() => { void onGoogle(); }}><img src="/provider/google.svg" width="20" height="20" alt="" />Continue with Google</button>
      {busy && <p className="google-continuation" role="status">Connecting...</p>}
      {!emailMode ? <button className="button button-outline auth-email-toggle" onClick={() => setEmailMode(true)}>Use email<Icon name="arrow" width="18" height="18" /></button> : <form onSubmit={(event) => {
        event.preventDefault();
        if (resetMode) void onReset(email.trim());
        else void onEmail(email.trim(), password, creating);
      }}>
        <div className="auth-intent" role="group" aria-label="Email account action"><button type="button" aria-pressed={!creating && !resetMode} disabled={busy} onClick={() => { setCreating(false); setResetMode(false); }}>Sign in</button><button type="button" aria-pressed={creating && !resetMode} disabled={busy} onClick={() => { setCreating(true); setResetMode(false); }}>Create account</button></div>
        <label htmlFor={`${id}-email`}>Email</label><input ref={emailInput} id={`${id}-email`} name="email" type="email" autoComplete="email" inputMode="email" spellCheck={false} required maxLength={254} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        {!resetMode && <><label htmlFor={`${id}-password`}>Password{creating && <span>At least 12 characters; a passphrase works well.</span>}</label><div className="password-field"><input id={`${id}-password`} name="password" type={revealed ? 'text' : 'password'} autoComplete={creating ? 'new-password' : 'current-password'} required minLength={creating ? 12 : undefined} maxLength={256} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="text-button" aria-label={revealed ? 'Hide password' : 'Show password'} aria-pressed={revealed} onClick={() => setRevealed((value) => !value)}>{revealed ? 'Hide' : 'Show'}</button></div></>}
        <button className="button button-dark auth-submit" disabled={busy} type="submit">{busy ? 'Please wait...' : resetMode ? 'Send reset email' : creating ? 'Create account with email' : 'Sign in with email'}<Icon name="arrow" width="18" height="18" /></button>
        {!creating && <button className="text-button" type="button" disabled={busy} onClick={() => { setResetMode((value) => !value); if (!email) emailInput.current?.focus(); }}>{resetMode ? 'Back to sign in' : 'Reset password'}</button>}
      </form>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {message && <p className="account-notice" role="status">{message}</p>}
      <p className="account-privacy">Signing in does not publish your library. <DataUseLink /></p>
      <button className="text-button" onClick={onDevice} disabled={busy}>Keep using this device<Icon name="back" width="17" height="17" /></button>
    </div>
  );
}
