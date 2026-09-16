import { readFirebaseConfiguration } from './online-config';
import { GOOGLE_REDIRECT_KEY } from './google-intent';

export const ONLINE_HINT = 'play100.online-requested.v1';
export const EMULATOR_MODE = import.meta.env.MODE === 'cloud-test' && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const configured = readFirebaseConfiguration(import.meta.env);
export const ONLINE_CONFIG_ERROR = EMULATOR_MODE ? null : configured.error;

export function firebaseConfiguration(): { apiKey: string; authDomain: string; projectId: string; appId: string } | null {
  if (EMULATOR_MODE) return { apiKey: 'demo-play100-key', authDomain: 'demo-play100.firebaseapp.com', projectId: 'demo-play100', appId: 'demo-play100-app' };
  return configured.config;
}

export const ONLINE_AVAILABLE = Boolean(firebaseConfiguration());

export function onlineWasRequested(): boolean {
  if (!ONLINE_AVAILABLE) return false;
  try { if (sessionStorage.getItem(GOOGLE_REDIRECT_KEY) !== null) return true; }
  catch { console.warn('The temporary Google return preference could not be read. Device-only mode remains available.'); }
  try { return localStorage.getItem(ONLINE_HINT) === 'yes'; }
  catch { console.warn('The online sign-in preference could not be read. Device-only mode remains available.'); return false; }
}

export function rememberOnlineRequest(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(ONLINE_HINT, 'yes');
    else localStorage.removeItem(ONLINE_HINT);
  } catch { console.warn('The online sign-in preference could not be saved on this browser.'); }
}
