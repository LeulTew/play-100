import { describe, expect, it } from 'vitest';
import { onlineError } from './errors';

describe('password policy error disclosure', () => {
  it('explains the advertised new-password requirement without echoing submitted data', () => {
    const error = Object.assign(new Error('Firebase rejected submitted-secret-value'), {
      code: 'auth/password-does-not-meet-requirements',
    });
    expect(onlineError(error)).toBe('Choose a password or passphrase with at least 12 characters.');
    expect(onlineError(error)).not.toContain('submitted-secret-value');
  });

  it('keeps existing sign-in and weak-password guidance separate from the new-password policy', () => {
    expect(onlineError({ code: 'auth/weak-password' })).toBe('Choose a longer password or passphrase.');
    expect(onlineError({ code: 'auth/invalid-credential' })).toBe('The sign-in details were not accepted. Check them or reset your password.');
  });
});
