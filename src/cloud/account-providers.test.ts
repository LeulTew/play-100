import { EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import { describe, expect, it } from 'vitest';
import { hasProvider } from './account-providers';

describe('exact account provider IDs', () => {
  it('recognizes each linked SDK provider independently', () => {
    const identity = { providers: [EmailAuthProvider.PROVIDER_ID, GoogleAuthProvider.PROVIDER_ID] };
    expect(hasProvider(identity, GoogleAuthProvider.PROVIDER_ID)).toBe(true);
    expect(hasProvider(identity, EmailAuthProvider.PROVIDER_ID)).toBe(true);
    expect(hasProvider({ providers: [GoogleAuthProvider.PROVIDER_ID] }, EmailAuthProvider.PROVIDER_ID)).toBe(false);
  });
  it.each(['not-google.com', 'google.com.example', 'https://google.com', 'GOOGLE.COM', 'google.com,password'])(
    'does not treat %s as a Google provider ID',
    (providerId) => {
      expect(hasProvider({ providers: [providerId] }, GoogleAuthProvider.PROVIDER_ID)).toBe(false);
    },
  );
  it('does not choose password confirmation from a partial provider ID', () => {
    expect(hasProvider({ providers: ['passwordless', 'not-password'] }, EmailAuthProvider.PROVIDER_ID)).toBe(false);
  });
  it('handles accounts with no linked provider and an absent identity', () => {
    expect(hasProvider({ providers: [] }, GoogleAuthProvider.PROVIDER_ID)).toBe(false);
    expect(hasProvider(null, GoogleAuthProvider.PROVIDER_ID)).toBe(false);
    expect(hasProvider(undefined, EmailAuthProvider.PROVIDER_ID)).toBe(false);
  });
});
