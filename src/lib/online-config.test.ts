import { describe, expect, it } from 'vitest';
import { readFirebaseConfiguration } from './online-config';
const valid = {
  VITE_FIREBASE_API_KEY: `AIza${'a'.repeat(35)}`,
  VITE_FIREBASE_AUTH_DOMAIN: 'play-100-collection.vercel.app',
  VITE_FIREBASE_PROJECT_ID: 'play100-online-48823b32',
  VITE_FIREBASE_APP_ID: '1:412256398362:web:abc123',
};
describe('public Firebase build/runtime configuration boundary', () => {
  it('accepts explicit primitive configuration fields without JSON escaping', () => {
    expect(readFirebaseConfiguration(valid)).toEqual({ config: { apiKey: valid.VITE_FIREBASE_API_KEY, authDomain: valid.VITE_FIREBASE_AUTH_DOMAIN, projectId: valid.VITE_FIREBASE_PROJECT_ID, appId: valid.VITE_FIREBASE_APP_ID }, error: null });
  });
  it('permits a deliberately device-only build', () => {
    expect(readFirebaseConfiguration({})).toEqual({ config: null, error: null });
  });
  it.each([
    { VITE_FIREBASE_CONFIG: '{\n  ' },
    { ...valid, VITE_FIREBASE_API_KEY: '' },
    { ...valid, VITE_FIREBASE_PROJECT_ID: 'another-project' },
    { ...valid, VITE_FIREBASE_AUTH_DOMAIN: 'untrusted.example' },
    { ...valid, VITE_FIREBASE_AUTH_DOMAIN: 'play100-online-48823b32.firebaseapp.com' },
    { ...valid, VITE_FIREBASE_APP_ID: '{"broken":' },
  ])('returns a visible optional-feature error instead of throwing during app import', (environment) => {
    const result = readFirebaseConfiguration(environment);
    expect(result.config).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
