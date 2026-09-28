import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { LibraryRecord } from '../lib/personal-types';
import type { SignInPurposeTicket } from '../lib/sign-in-purpose';
import { compareReturnFocusTarget, usableReturnFocusTarget } from '../lib/return-focus';
import { captureView } from '../lib/view-guard';
import { useLatest } from './useLatest';

type Origin = { isCurrent: () => boolean };

export interface CompareSignIn {
  uid: string;
  pins: LibraryRecord[];
  isCurrent: () => boolean;
}

/**
 * A sign-in the Compare tray started: its purpose ticket, where focus returns when the sheet closes, and the held
 * comparison that continues once that account opens (useCompareContinuation).
 */
export function useCompareSignIn({
  scope,
  panel,
  selectedSlug,
  opening,
  signedIn,
  navigationGeneration,
  captureHeld,
}: {
  scope: string;
  panel: string | null;
  selectedSlug: string | null;
  opening: boolean;
  signedIn: boolean;
  navigationGeneration: Readonly<{ current: number }>;
  captureHeld: () => () => boolean;
}) {
  const origin = useRef<Origin | null>(null);
  const [signInTicket, setSignInTicket] = useState<SignInPurposeTicket | null>(null);
  // A sign-in the Compare tray started, reported with the device's pins once it succeeds (compareGames continues it).
  const [compareSignIn, setCompareSignIn] = useState<CompareSignIn | null>(null);
  const [pendingReturn, setPendingReturn] = useState<{ origin: Origin; fallback: HTMLElement | null } | null>(null);
  const accountPanelOpen = useLatest(panel === 'account');
  const getSignInReturnFocus = useCallback(
    (authenticated = false) => {
      const started = origin.current;
      if (!started) return null;
      const current = !authenticated && started.isCurrent();
      // A loading sheet can unmount while the same sign-in invocation is still open.
      if (current && accountPanelOpen.current) return null;
      const action = current ? compareReturnFocusTarget() : null;
      const fallback =
        [...document.querySelectorAll<HTMLElement>('.account-nav, [data-page-heading], #collection-title')].find(
          usableReturnFocusTarget,
        ) ?? null;
      if (current && !action) setPendingReturn({ origin: started, fallback });
      else {
        origin.current = null;
        setPendingReturn(null);
      }
      return action ?? fallback;
    },
    [accountPanelOpen],
  );
  useLayoutEffect(() => {
    if (!pendingReturn) return;
    const { origin: started, fallback } = pendingReturn;
    const cancel = () => {
      if (origin.current === started) origin.current = null;
      setPendingReturn((current) => (current === pendingReturn ? null : current));
    };
    if (
      origin.current !== started ||
      !started.isCurrent() ||
      signedIn ||
      panel ||
      selectedSlug ||
      document.activeElement !== fallback
    ) {
      cancel();
      return;
    }
    const target = !opening && !document.querySelector('dialog[open]') ? compareReturnFocusTarget() : null;
    if (target) {
      cancel();
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      target.focus({ preventScroll: true });
      return;
    }
    // Dialog cleanup has already focused the fallback. Any later focus or input belongs to the user.
    const movedFocus = (event: FocusEvent) => {
      if (event.target !== fallback) cancel();
    };
    document.addEventListener('focusin', movedFocus);
    document.addEventListener('pointerdown', cancel, true);
    document.addEventListener('keydown', cancel, true);
    window.addEventListener('popstate', cancel);
    window.addEventListener('play100:navigate', cancel);
    return () => {
      document.removeEventListener('focusin', movedFocus);
      document.removeEventListener('pointerdown', cancel, true);
      document.removeEventListener('keydown', cancel, true);
      window.removeEventListener('popstate', cancel);
      window.removeEventListener('play100:navigate', cancel);
    };
  }, [pendingReturn, opening, signedIn, scope, panel, selectedSlug]);
  /** The sheet opens for this invocation; only a Compare invocation returns focus to the tray. */
  const beginSignIn = useCallback((compare: boolean, isCurrent: () => boolean) => {
    origin.current = compare ? { isCurrent } : null;
  }, []);
  /** Navigation drops the invocation, its ticket and any held comparison. */
  const reset = useCallback(() => {
    origin.current = null;
    setSignInTicket(null);
    setCompareSignIn(null);
  }, []);
  // It continues only from where it signed in: a navigation (Back, a link, one saving an edit), a changed view, an
  // open panel or another session drops it.
  const holdComparison = useCallback(
    (uid: string, pins: LibraryRecord[], signedInHere: () => boolean) => {
      const navigation = navigationGeneration.current;
      const held = captureHeld();
      const view = captureView();
      setCompareSignIn({
        uid,
        pins,
        isCurrent: () => signedInHere() && navigation === navigationGeneration.current && held() && view(),
      });
    },
    [navigationGeneration, captureHeld],
  );
  return {
    signInTicket,
    setSignInTicket,
    compareSignIn,
    getSignInReturnFocus,
    beginSignIn,
    reset,
    holdComparison,
  };
}

/**
 * Once the account a Compare sign-in opened is ready, the tray's own checks continue it: Compare with the pins, or
 * Account when the account cannot compare yet. Each held comparison is decided once.
 */
export function useCompareContinuation({
  compareSignIn,
  panel,
  opening,
  signedInUid,
  onContinue,
}: {
  compareSignIn: CompareSignIn | null;
  panel: string | null;
  opening: boolean;
  signedInUid: string | undefined;
  onContinue: (pins: LibraryRecord[]) => void;
}) {
  const decided = useRef<CompareSignIn | null>(null);
  const continueComparison = useEffectEvent(onContinue);
  useEffect(() => {
    if (!compareSignIn || decided.current === compareSignIn) return;
    const current = !panel && compareSignIn.isCurrent();
    if (current && (opening || signedInUid !== compareSignIn.uid)) return;
    decided.current = compareSignIn;
    if (current) continueComparison(compareSignIn.pins);
  }, [compareSignIn, opening, signedInUid, panel]);
}
