import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialStore } from './social-store';
import { parseHandle, normalizeHandle } from '../lib/community';

const read = vi.hoisted(() => vi.fn());
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  getDocFromServer: read,
}));
const app = initializeApp({ projectId: 'demo-play100' }, 'public-profile-read-unit');
const social = new SocialStore(getFirestore(app));
beforeEach(() => {
  read.mockReset();
});
afterAll(() => deleteApp(app));

describe('public profile existence privacy', () => {
  it('maps denied direct profile reads to unavailable without hiding other failures', async () => {
    read.mockRejectedValueOnce({ code: 'permission-denied' });
    expect(await social.ownProfile('another')).toBeNull();
    read.mockRejectedValueOnce(new Error('Offline'));
    await expect(social.ownProfile('another')).rejects.toThrow('Offline');
  });
  it('maps denied handle and resolved-profile reads identically to missing profiles', async () => {
    read.mockRejectedValueOnce({ code: 'permission-denied' });
    expect(await social.profile('public_games')).toBeNull();
    read
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ uid: 'another' }) })
      .mockRejectedValueOnce({ code: 'permission-denied' });
    expect(await social.profile('public_games')).toBeNull();
    read.mockResolvedValueOnce({ exists: () => false });
    expect(await social.profile('public_games')).toBeNull();
  });
  it('preserves legacy profile handle reads while new impersonating claims are rejected', () => {
    expect(parseHandle('leul_tew')).toBe('leul_tew');
    expect(() => normalizeHandle('leul_tew')).toThrow(/reserved/);
  });
});
