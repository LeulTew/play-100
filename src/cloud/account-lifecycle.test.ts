import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import type { IdTokenResult } from 'firebase/auth';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from '../lib/cloud-types';
import { removeCancelledRegistration, readAccountLifecycle, CANCELLED_REGISTRATION_MESSAGE } from './account-lifecycle';

const calls = vi.hoisted(() => ({
  read: vi.fn(),
  transaction: vi.fn(),
  deleteDevice: vi.fn(async () => {}),
}));
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  getDocFromServer: calls.read,
  runTransaction: calls.transaction,
}));
vi.mock('../lib/scoped-library', () => ({ deleteScopedLibrary: calls.deleteDevice }));
const app = initializeApp({ projectId: 'demo-play100' }, 'cancelled-lifecycle-unit');
const db = getFirestore(app);
const token: IdTokenResult = {
  authTime: '',
  issuedAtTime: '',
  expirationTime: '',
  signInProvider: 'password',
  signInSecondFactor: null,
  token: 'synthetic-unit-token',
  claims: { email_verified: true },
};
const user = () => ({ uid: 'Cancelled', getIdTokenResult: vi.fn(async () => token), delete: vi.fn(async () => {}) });
beforeEach(() => {
  vi.clearAllMocks();
  calls.read.mockResolvedValue({ exists: () => true, data: () => ({ state: 'cancelled' }) });
});
afterAll(() => deleteApp(app));

describe('cancelled verified sign-in recovery', () => {
  it('removes Auth and the exact account copy without a content transaction or cleanup write', async () => {
    const identity = user();
    const scope = accountScope(identity.uid, 'demo-play100');
    expect(await removeCancelledRegistration(db, identity, scope, () => true)).toBe(true);
    expect(identity.getIdTokenResult).toHaveBeenCalledWith(true);
    expect(identity.delete).toHaveBeenCalledOnce();
    expect(calls.deleteDevice).toHaveBeenCalledExactlyOnceWith(scope);
    expect(calls.transaction).not.toHaveBeenCalled();
    expect(identity.delete.mock.invocationCallOrder[0]).toBeLessThan(calls.deleteDevice.mock.invocationCallOrder[0]!);
    expect(CANCELLED_REGISTRATION_MESSAGE).toContain('same email');
  });
  it('keeps active registrations on the normal cleanup path and denies stale scope or unverified removal', async () => {
    const identity = user();
    const scope = accountScope(identity.uid, 'demo-play100');
    calls.read.mockResolvedValue({ exists: () => true, data: () => ({ state: 'active' }) });
    expect(await removeCancelledRegistration(db, identity, scope, () => true)).toBe(false);
    await expect(removeCancelledRegistration(db, identity, scope, () => false)).rejects.toThrow(/changed/);
    identity.getIdTokenResult.mockResolvedValue({ ...token, claims: { email_verified: false } });
    expect(await removeCancelledRegistration(db, identity, scope, () => true)).toBe(false);
    expect(identity.delete).not.toHaveBeenCalled();
    expect(calls.deleteDevice).not.toHaveBeenCalled();
  });
  it('does not delete when lifecycle reading fails or the identity changes during it', async () => {
    const identity = user();
    const scope = accountScope(identity.uid, 'demo-play100');
    calls.read.mockRejectedValueOnce(new Error('Offline'));
    await expect(removeCancelledRegistration(db, identity, scope, () => true)).rejects.toThrow('Offline');
    let current = true;
    calls.read.mockImplementationOnce(async () => {
      current = false;
      return { exists: () => true, data: () => ({ state: 'cancelled' }) };
    });
    await expect(removeCancelledRegistration(db, identity, scope, () => current)).rejects.toThrow(/changed/);
    expect(identity.delete).not.toHaveBeenCalled();
    calls.read.mockResolvedValue({ exists: () => true, data: () => ({ state: 'unexpected' }) });
    await expect(readAccountLifecycle(db, identity.uid)).rejects.toThrow(/could not be read/);
  });
});
