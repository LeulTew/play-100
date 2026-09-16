import { getRedirectResult, GoogleAuthProvider, linkWithRedirect, reauthenticateWithRedirect, signInWithRedirect } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { clearGoogleIntent, readGoogleIntent, validateGoogleReturn, writeGoogleIntent } from '../lib/google-intent';
import type { GoogleRedirectIntent, GoogleRequest } from '../lib/google-intent';
import { rememberOnlineRequest } from '../lib/online-availability';
import { onlineError, popupCancelled } from './errors';

export interface GoogleReturn {
  attempted: boolean; intent: GoogleRedirectIntent | null; uid: string | null;
  completed: boolean; error: string; message: string;
}
const returns = new WeakMap<Auth, Promise<GoogleReturn>>();

export async function startGoogleRedirect(auth: Auth, request: GoogleRequest): Promise<never> {
  if (!navigator.onLine) throw new Error('Connect before continuing to Google. Your device library is unchanged.');
  if ((auth.currentUser?.uid ?? null) !== request.uid) throw new Error('The signed-in account changed. Start the Google action again from Account.');
  const stored = writeGoogleIntent(request, `${location.pathname}${location.search}`);
  rememberOnlineRequest(true);
  try {
    // Firebase owns OAuth state/CSRF and credential storage; this record only restores UI intent.
    if (`${location.pathname}${location.search}${location.hash}` !== stored.intent.returnPath) {
      history.replaceState(history.state, '', stored.intent.returnPath);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (request.kind === 'sign-in') await signInWithRedirect(auth, provider);
    else {
      const user = auth.currentUser;
      if (!user || user.uid !== request.uid) throw new Error('The account changed before Google could open.');
      if (request.kind === 'link') await linkWithRedirect(user, provider);
      else await reauthenticateWithRedirect(user, provider);
    }
    throw new Error('Google did not open in this tab. Try again when connected, or use email.');
  } catch (cause) { clearGoogleIntent(stored.raw); throw cause; }
}

export function finishGoogleRedirect(auth: Auth): Promise<GoogleReturn> {
  const previous = returns.get(auth);
  if (previous) return previous;
  const task = (async (): Promise<GoogleReturn> => {
    const stored = readGoogleIntent();
    const outcome: GoogleReturn = { attempted: stored.raw !== null, intent: stored.intent, uid: null, completed: false, error: stored.error, message: '' };
    try {
      const result = await getRedirectResult(auth);
      if (result) {
        outcome.attempted = true;
        if (!stored.intent) throw new Error(stored.error || 'Google returned without a matching request in this tab. Review Account; nothing was deleted or copied.');
        validateGoogleReturn(stored.intent, { uid: result.user.uid, providerId: result.providerId, operationType: result.operationType }, auth.currentUser?.uid ?? null);
        outcome.uid = result.user.uid; outcome.completed = true; outcome.error = '';
      } else if (stored.intent) {
        outcome.message = stored.intent.kind === 'reauthenticate'
          ? 'Google confirmation was not completed. Nothing has been deleted.'
          : stored.intent.kind === 'link' ? 'Google linking was not completed. Your existing account is unchanged.'
          : 'Google sign-in was not completed. Your device library is unchanged.';
      }
    } catch (cause) {
      outcome.attempted = true;
      if (popupCancelled(cause)) outcome.message = 'Google sign-in was cancelled. Your library is unchanged.';
      else outcome.error = onlineError(cause);
    }
    try { clearGoogleIntent(stored.raw); }
    catch (cause) { outcome.error = onlineError(cause); outcome.completed = false; }
    return outcome;
  })();
  returns.set(auth, task);
  return task;
}
