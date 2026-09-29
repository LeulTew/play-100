import { describe, expect, it } from 'vitest';
import { CLOUD_PAGES } from '../lib/cloud-pages';
import { appDocumentTitle } from '../lib/document-title';
import { signInPageTitle } from './sign-in-page-title';

// Community, public profiles and invitations have content for a signed-out visitor; every other online page shows
// sign-in in its place.
const signedOutPages = CLOUD_PAGES.filter((page) => !['community', 'profile', 'invite'].includes(page));

describe('signed-out page heading', () => {
  it.each(signedOutPages)('names the %s page as its tab title does', (page) => {
    expect(appDocumentTitle(page)).toBe(`${signInPageTitle(page)} | Play 100`);
  });

  it('falls back to Sign in for a page with its own signed-out content', () => {
    expect(signInPageTitle('community')).toBe('Sign in');
    expect(signInPageTitle('collection')).toBe('Sign in');
  });
});
