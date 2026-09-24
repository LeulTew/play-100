import type { AppPage } from './types';

export type SignInPurpose = 'compare';
export interface SignInPurposeTicket { purpose: SignInPurpose; isCurrent: () => boolean }

// Only an explicit Compare invocation carries a purpose; ordinary Account entry never inherits one.
export function signInPurposeTicket(invocation: 'account' | 'compare', isCurrent: () => boolean): SignInPurposeTicket | null {
  return invocation === 'compare' ? { purpose: 'compare', isCurrent } : null;
}

// A ticket only speaks for the open sheet while its view, navigation and scope are still current.
export function currentSignInPurpose(ticket: SignInPurposeTicket | null, sheetOpen: boolean): SignInPurpose | undefined {
  return sheetOpen && ticket && ticket.isCurrent() ? ticket.purpose : undefined;
}

export function authPanelPurposes(page: AppPage, sheet: SignInPurpose | undefined): { page: SignInPurpose | undefined; sheet: SignInPurpose | undefined } {
  const route: SignInPurpose | undefined = page === 'compare' ? 'compare' : undefined;
  return { page: route, sheet: sheet ?? route };
}
