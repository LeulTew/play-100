import { readFirebaseConfiguration } from './online-config';
import { GOOGLE_REDIRECT_KEY } from './google-intent-key';
import { readOnlineLoadHint, saveOnlineLoadHint } from './personal-db';

export const ONLINE_HINT = 'play100.online-requested.v1';
export const EMULATOR_MODE =
  import.meta.env.MODE === 'cloud-test' && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const configured = readFirebaseConfiguration(import.meta.env);
export const ONLINE_CONFIG_ERROR = EMULATOR_MODE ? null : configured.error;

export function firebaseConfiguration(): {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
} | null {
  if (EMULATOR_MODE)
    return {
      apiKey: 'demo-play100-key',
      authDomain: 'demo-play100.firebaseapp.com',
      projectId: 'demo-play100',
      appId: 'demo-play100-app',
    };
  return configured.config;
}

export const ONLINE_AVAILABLE = Boolean(firebaseConfiguration());
let hintVersion = 0;
let currentHint: boolean | null = null;
let hintWrites: Promise<unknown> = Promise.resolve();

export function onlineWasRequested(): boolean {
  if (!ONLINE_AVAILABLE) return false;
  try {
    if (sessionStorage.getItem(GOOGLE_REDIRECT_KEY) !== null) return true;
  } catch {
    console.warn('The temporary Google return preference could not be read. Device-only mode remains available.');
  }
  try {
    return localStorage.getItem(ONLINE_HINT) === 'yes';
  } catch {
    console.warn('The online sign-in preference could not be read. Device-only mode remains available.');
    return false;
  }
}

export async function resolveOnlineRequest(): Promise<boolean> {
  const config = firebaseConfiguration();
  if (!config) return false;
  if (currentHint !== null) return currentHint;
  if (onlineWasRequested()) return true;
  const version = hintVersion;
  const remembered = await readOnlineLoadHint(config.projectId);
  return version === hintVersion ? remembered : currentHint === true;
}

export function rememberOnlineRequest(enabled: boolean): Promise<boolean> {
  hintVersion += 1;
  currentHint = enabled;
  let local = false;
  try {
    if (enabled) localStorage.setItem(ONLINE_HINT, 'yes');
    else localStorage.removeItem(ONLINE_HINT);
    local = enabled ? localStorage.getItem(ONLINE_HINT) === 'yes' : localStorage.getItem(ONLINE_HINT) === null;
  } catch {
    /* The owned IndexedDB marker is the durable fallback. */
  }
  const written = hintWrites
    .then(() => saveOnlineLoadHint(enabled))
    .then(
      () => true,
      () => {
        if (!local)
          console.warn(
            'Browser storage could not remember the account choice. Sign-in may be temporary; no library was cleared.',
          );
        return local;
      },
    );
  hintWrites = written;
  return written;
}
