import type { AppPage } from '../lib/types';

// A signed-out online page shows sign-in in its own place, under its own name, which its tab title and loading
// placeholder also show.
const titles: Partial<Record<AppPage, string>> = {
  account: 'Account',
  publish: 'Publish ranking',
  creator: 'Creator desk',
  friends: 'Friends',
  friend: 'Friend',
  compare: 'Compare rankings',
  'friend-sharing': 'Friend sharing',
  'friend-shelf': 'Shared games',
};

/** The heading of the sign-in panel a signed-out online page shows in its place. */
export function signInPageTitle(page: AppPage): string {
  return titles[page] ?? 'Sign in';
}
