import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator, indexedDBLocalPersistence, inMemoryPersistence, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { EMULATOR_MODE, firebaseConfiguration } from '../lib/online-availability';
import { readAppCheckConfiguration } from '../lib/app-check-config';

const config = firebaseConfiguration();
if (!config) throw new Error('Online saving is not configured on this deployment. Device-only browsing still works.');

export const firebaseApp = initializeApp(config, 'play100-online');
// The literal build-time flag lets the bundler drop this branch and its chunk from default builds.
if (import.meta.env.VITE_APP_CHECK_ENABLED === 'true' && !EMULATOR_MODE) {
  const appCheck = readAppCheckConfiguration(import.meta.env).config;
  if (appCheck) {
    void import('./app-check-client').then(module => module.startAppCheck(firebaseApp, appCheck.siteKey))
      .catch(() => console.warn('App Check could not start. Online tools continue without attestation.'));
  }
}
export const cloudDb = initializeFirestore(firebaseApp, { localCache: memoryLocalCache(), experimentalAutoDetectLongPolling: true });
export const cloudAuth = initializeAuth(firebaseApp, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
if (EMULATOR_MODE) {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Test authentication cannot run on a public origin.');
  connectAuthEmulator(cloudAuth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(cloudDb, '127.0.0.1', 8188);
}
// A fresh module initialization with a user and no redirect result is public-SDK evidence of restored sign-in.
export const initialAuthUser = cloudAuth.authStateReady().then(() => cloudAuth.currentUser?.uid ?? null);
