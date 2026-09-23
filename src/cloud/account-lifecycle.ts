import { doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { deleteScopedLibrary } from '../lib/scoped-library';
import { scopeUid } from '../lib/cloud-types';
import type { LibraryScope } from '../lib/cloud-types';

export const CANCELLED_REGISTRATION_MESSAGE =
  'This sign-in belongs to a cancelled registration. Remove this sign-in from Account to start fresh with the same email.';

export async function readAccountLifecycle(db: Firestore, uid: string): Promise<'active' | 'cancelled' | null> {
  const snapshot = await getDocFromServer(doc(db, 'accountLifecycle', uid));
  if (!snapshot.exists()) return null;
  const value = snapshot.data();
  if (Object.keys(value).join() !== 'state' || (value.state !== 'active' && value.state !== 'cancelled')) {
    throw new Error('The account registration state could not be read. Nothing was changed.');
  }
  return value.state === 'active' ? 'active' : 'cancelled';
}

export async function removeCancelledRegistration(
  db: Firestore, user: Pick<User, 'uid' | 'getIdTokenResult' | 'delete'>, scope: LibraryScope, isCurrent: () => boolean,
): Promise<boolean> {
  if (scopeUid(scope) !== user.uid || !isCurrent()) throw new Error('The signed-in account changed. Nothing was deleted.');
  const token = await user.getIdTokenResult(true);
  if (!isCurrent()) throw new Error('The signed-in account changed. Nothing was deleted.');
  if (token.claims.email_verified !== true || await readAccountLifecycle(db, user.uid) !== 'cancelled') return false;
  if (!isCurrent()) throw new Error('The signed-in account changed. Nothing was deleted.');
  // The immutable cancelled marker prohibits content bootstrap; do not create cleanup state.
  await user.delete();
  await deleteScopedLibrary(scope);
  return true;
}

export async function ensureAccountActivity(db: Firestore, uid: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'accountLifecycle', uid);
    const current = await transaction.get(ref);
    if (current.exists()) {
      if (current.data().state !== 'active') throw new Error(CANCELLED_REGISTRATION_MESSAGE);
      return;
    }
    transaction.set(ref, { state: 'active' });
  });
}

export async function cancelUnusedRegistration(db: Firestore, uid: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'accountLifecycle', uid);
    const current = await transaction.get(ref);
    if (current.exists()) {
      if (current.data().state !== 'cancelled') throw new Error('This account has online activity. Verify its email before using full data and account deletion.');
      return;
    }
    transaction.set(ref, { state: 'cancelled' });
  });
}
