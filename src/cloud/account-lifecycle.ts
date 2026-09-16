import { doc, runTransaction } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

export async function ensureAccountActivity(db: Firestore, uid: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'accountLifecycle', uid);
    const current = await transaction.get(ref);
    if (current.exists()) {
      if (current.data().state !== 'active') throw new Error('This registration is being cancelled. Finish deleting it before starting a new account.');
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
