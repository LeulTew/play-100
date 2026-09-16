import { describe, expect, it } from 'vitest';
import { GOOGLE_INTENT_LIFETIME, googleReturnPath, parseGoogleIntent, validateGoogleReturn } from './google-intent';

const now = 1789540000000;
const intent = {
  version: 1, requestId: 'a'.repeat(32), createdAt: now, returnPath: '/account',
  kind: 'reauthenticate', uid: 'qa-user-a', target: 'account', epoch: 3,
} as const;

describe('Google UI intent is not authentication authority', () => {
  it('retains approved deep links but removes credentials and rejects external/unapproved routes', () => {
    expect(googleReturnPath('/?q=Racing&game=forza-horizon-5&access_token=not-a-token')).toBe('/?q=Racing&game=forza-horizon-5');
    for (const route of ['https://evil.example/', '//evil.example/', '/\\evil.example/', '/__/auth/handler', '/unapproved']) expect(googleReturnPath(route)).toBe('/account');
  });
  it('accepts only a bounded, unexpired, exact-shape request without credentials', () => {
    expect(parseGoogleIntent(JSON.stringify(intent), now)).toEqual(intent);
    expect(() => parseGoogleIntent(JSON.stringify({ ...intent, accessToken: 'forbidden' }), now)).toThrow();
    expect(() => parseGoogleIntent(JSON.stringify(intent), now + GOOGLE_INTENT_LIFETIME + 1)).toThrow(/expired/);
    expect(() => parseGoogleIntent(JSON.stringify({ ...intent, returnPath: '//evil.example/' }), now)).toThrow();
    expect(() => parseGoogleIntent(JSON.stringify({ ...intent, target: 'all-users' }), now)).toThrow();
  });
  it('requires the actual SDK operation, Google provider, expected UID and current UID together', () => {
    const valid = { uid: intent.uid, providerId: 'google.com', operationType: 'reauthenticate' };
    expect(() => validateGoogleReturn(intent, valid, intent.uid)).not.toThrow();
    expect(() => validateGoogleReturn(intent, { ...valid, operationType: 'signIn' }, intent.uid)).toThrow();
    expect(() => validateGoogleReturn(intent, { ...valid, providerId: 'password' }, intent.uid)).toThrow();
    expect(() => validateGoogleReturn(intent, { ...valid, uid: 'qa-user-b' }, 'qa-user-b')).toThrow();
    expect(() => validateGoogleReturn(intent, valid, 'qa-user-b')).toThrow();
  });
});
