import { initializeApp } from 'firebase/app';
import { browserPopupRedirectResolver, connectAuthEmulator, indexedDBLocalPersistence, inMemoryPersistence, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { EMULATOR_MODE, firebaseConfiguration } from '../lib/online-availability';

const config = firebaseConfiguration();
if (!config) throw new Error('Online saving is not configured on this deployment. Device-only browsing still works.');

export const firebaseApp = initializeApp(config, 'play100-online');
export const cloudDb = initializeFirestore(firebaseApp, { localCache: memoryLocalCache(), experimentalAutoDetectLongPolling: true });
export const cloudAuth = initializeAuth(firebaseApp, {
  persistence: [indexedDBLocalPersistence, inMemoryPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
if (EMULATOR_MODE) {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Test authentication cannot run on a public origin.');
  connectAuthEmulator(cloudAuth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(cloudDb, '127.0.0.1', 8188);
}
