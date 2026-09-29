import type { AppPage } from './types';

export type SignInPurpose = 'compare';
/** What a sign-in panel explains before its choices: Compare, or the signed-out page it stands in for. */
export type AuthPurpose =
  SignInPurpose | 'account' | 'friends' | 'publish' | 'friend-sharing' | 'friend-shelf' | 'creator';
export interface SignInPurposeTicket {
  purpose: SignInPurpose;
  isCurrent: () => boolean;
}

// Only an explicit Compare invocation carries a purpose; ordinary Account entry never inherits one.
export function signInPurposeTicket(
  invocation: 'account' | 'compare',
  isCurrent: () => boolean,
): SignInPurposeTicket | null {
  return invocation === 'compare' ? { purpose: 'compare', isCurrent } : null;
}

// A ticket only speaks for the open sheet while its view, navigation and scope are still current.
export function currentSignInPurpose(
  ticket: SignInPurposeTicket | null,
  sheetOpen: boolean,
): SignInPurpose | undefined {
  return sheetOpen && ticket && ticket.isCurrent() ? ticket.purpose : undefined;
}

const routePurposes: Partial<Record<AppPage, AuthPurpose>> = {
  compare: 'compare',
  account: 'account',
  friends: 'friends',
  friend: 'friends',
  publish: 'publish',
  'friend-sharing': 'friend-sharing',
  'friend-shelf': 'friend-shelf',
  creator: 'creator',
};

// A signed-out online page explains itself. Only Compare's purpose also carries into a sheet opened over its page: the
// other pages already show their own panel, and a sheet opened from Account there is about the account.
export function authPanelPurposes(
  page: AppPage,
  sheet: SignInPurpose | undefined,
): { page: AuthPurpose | undefined; sheet: SignInPurpose | undefined } {
  const route = routePurposes[page];
  return { page: route, sheet: sheet ?? (route === 'compare' ? route : undefined) };
}
