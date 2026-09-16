import { CLOUD_PROJECT } from './cloud-types';

export interface FirebasePublicConfiguration { apiKey: string; authDomain: string; projectId: string; appId: string }
export function readFirebaseConfiguration(environment: Record<string, unknown>): { config: FirebasePublicConfiguration | null; error: string | null } {
  const fields = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
  if (!fields.some((field) => environment[field] !== undefined && environment[field] !== '')) {
    return { config: null, error: environment.VITE_FIREBASE_CONFIG ? 'The old JSON online configuration is unsupported. Configure the four public Firebase fields before enabling online tools.' : null };
  }
  const [apiKey, authDomain, projectId, appId] = fields.map((field) => typeof environment[field] === 'string' ? (environment[field] as string).trim() : '');
  if (!apiKey || !/^AIza[A-Za-z0-9_-]{35}$/.test(apiKey) || authDomain !== `${CLOUD_PROJECT}.firebaseapp.com` ||
    projectId !== CLOUD_PROJECT || !appId || !/^1:\d+:web:[a-f0-9]+$/.test(appId)) {
    return { config: null, error: 'Online tools are unavailable because their public configuration is incomplete or invalid. Your device library remains available.' };
  }
  return { config: { apiKey, authDomain, projectId, appId }, error: null };
}
