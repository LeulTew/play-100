export function onlineError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'The sign-in details were not accepted. Check them or reset your password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use': 'This email already has an account. Sign in instead, or use its existing provider.',
    'auth/weak-password': 'Choose a longer password or passphrase.',
    'auth/too-many-requests': 'Too many attempts. Wait a little before trying again.',
    'auth/network-request-failed': 'The sign-in service could not be reached. Check your connection and try again.',
    'auth/popup-blocked': 'Google could not open a separate window. Continue with Google in this tab, or use email.',
    'auth/internal-error': 'Google sign-in could not initialize. Continue again when connected, or use email. Your library is unchanged.',
    'auth/web-storage-unsupported': 'Google could not use temporary storage in this tab. Use email or keep using this device; your library is unchanged.',
    'auth/user-mismatch': 'Choose the Google identity already linked to this account. Nothing has been deleted or copied.',
    'auth/account-exists-with-different-credential': 'Sign in with your existing email method first, then link Google from Account. Matching an email alone does not grant access.',
    'auth/credential-already-in-use': 'That Google identity is already connected to another account. Sign in to that account instead.',
    'auth/requires-recent-login': 'For this sensitive action, sign in again and retry. Your remaining data has not been silently deleted.',
    'auth/user-token-expired': 'Your sign-in expired. Sign in again; local changes remain in this account cache.',
    'auth/expired-action-code': 'This email link expired. Request a fresh verification or reset email.',
    'permission-denied': 'The server did not authorize this action. Check email verification and refresh Account. Your local copy remains safe.',
    'resource-exhausted': 'The free online quota is currently exhausted. Changes remain on this device; retry later. Billing is not enabled automatically.',
    'unavailable': 'Online storage is temporarily unreachable. Local changes remain pending; retry when connected.',
    'failed-precondition': 'Online storage needs attention before this action can finish. Your local data is safe; try again later.',
  };
  return messages[code] ?? (error instanceof Error ? error.message : 'The online action could not finish. Your local data is retained.');
}

export function popupCancelled(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request'));
}
