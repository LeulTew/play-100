import { CLOUD_PROJECT } from './cloud-types';

export const ONLINE_HINT = 'play100.online-requested.v1';
export const EMULATOR_MODE = import.meta.env.MODE === 'cloud-test' && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const raw: unknown = import.meta.env.VITE_FIREBASE_CONFIG;

export function firebaseConfiguration(): { apiKey: string; authDomain: string; projectId: string; appId: string } | null {
  if (EMULATOR_MODE) return { apiKey: 'demo-play100-key', authDomain: 'demo-play100.firebaseapp.com', projectId: 'demo-play100', appId: 'demo-play100-app' };
  if (typeof raw !== 'string' || !raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('Online saving configuration is invalid. Your device library is unaffected.'); }
  if (!value || typeof value !== 'object' || !('apiKey' in value) || typeof value.apiKey !== 'string' ||
    !('authDomain' in value) || value.authDomain !== `${CLOUD_PROJECT}.firebaseapp.com` ||
    !('projectId' in value) || value.projectId !== CLOUD_PROJECT ||
    !('appId' in value) || typeof value.appId !== 'string') {
    throw new Error('Online saving points to an unsupported project. Your device library is unaffected.');
  }
  return { apiKey: value.apiKey, authDomain: value.authDomain, projectId: value.projectId, appId: value.appId };
}

export const ONLINE_AVAILABLE = Boolean(firebaseConfiguration());

export function onlineWasRequested(): boolean {
  if (!ONLINE_AVAILABLE) return false;
  try { return localStorage.getItem(ONLINE_HINT) === 'yes'; }
  catch { console.warn('The online sign-in preference could not be read. Device-only mode remains available.'); return false; }
}

export function rememberOnlineRequest(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(ONLINE_HINT, 'yes');
    else localStorage.removeItem(ONLINE_HINT);
  } catch { console.warn('The online sign-in preference could not be saved on this browser.'); }
}
