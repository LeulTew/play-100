import { initializeApp, deleteApp } from 'firebase/app';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getFirestore } from 'firebase/firestore';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialStore } from './social-store';
import { isValidHandle, parseHandle, normalizeHandle } from '../lib/community';
import { emptyPersonalLibrary } from '../lib/personal-library';
import { PublicProfilePage } from './PublicProfilePage';

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
  it.each(['ab', '1starts_with_number', 'bad-handle', 'a'.repeat(25)])(
    'offers useful recovery rather than retry for the invalid link %s',
    (handle) => {
      expect(isValidHandle(handle)).toBe(false);
      expect(() => normalizeHandle(handle)).toThrow(
        'Choose 3–24 letters, numbers or underscores, starting with a letter.',
      );
      const html = renderToStaticMarkup(
        createElement(PublicProfilePage, {
          social,
          handle,
          games: [],
          library: {
            state: emptyPersonalLibrary(),
            status: 'ready',
            warning: null,
            error: null,
            busy: false,
            perform: vi.fn(async () => true),
            restore: vi.fn(async () => true),
            reset: vi.fn(async () => true),
          },
          identity: null,
          onOpenRecord: vi.fn(),
          onShare: vi.fn(),
          onAccount: vi.fn(),
          onFriend: vi.fn(),
        }),
      );
      expect(html).toContain('This ranking link isn&#x27;t valid.');
      expect(html).toContain('Check the link or browse Community.');
      expect(html).toContain('href="/community"');
      expect(html).not.toContain('Try again');
      expect(html).not.toContain('Choose 3');
      expect(html).not.toContain('Opening this ranking');
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each(['abc', 'a'.repeat(24), ' Legacy_123 ', 'leul_tew', '\u212Aelvin'])(
    'still accepts valid and legacy public handles: %s',
    (handle) => {
      expect(isValidHandle(handle)).toBe(true);
      expect(parseHandle(handle)).toBe(handle.trim().toLowerCase());
    },
  );
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
  it('runs publication methods through the store, so a patched store method is the one they call', async () => {
    const withdraw = vi.spyOn(SocialStore.prototype, 'withdrawReport').mockResolvedValue();
    try {
      expect(await social.resolveReport('report-a')).toBe(true);
      expect(withdraw).toHaveBeenCalledExactlyOnceWith('report-a');
    } finally {
      withdraw.mockRestore();
    }
  });
});
