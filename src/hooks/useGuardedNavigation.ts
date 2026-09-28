import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { focusPendingEditor } from '../lib/dialog-focus';
import { editFlush } from '../lib/edit-flush';
import { captureView } from '../lib/view-guard';

interface Recovery {
  target: HTMLElement | null;
  isCurrent: () => boolean;
}

/**
 * Navigation that first saves the open edits. Each guarded command is a new intent that supersedes older ones; it
 * lands only while the app is mounted, the intent is the latest, its own checks pass and the view is unchanged. A
 * blocked or failed save returns focus to the editor once the library is idle.
 */
export function useGuardedNavigation({
  busy,
  notify,
  captureFocusGuard,
}: {
  busy: boolean;
  notify: (message: string) => void;
  captureFocusGuard: () => () => boolean;
}) {
  const intent = useRef(0);
  const mounted = useRef(true);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const recovered = useRef<Recovery | null>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (busy || !recovery || recovered.current === recovery) return;
    recovered.current = recovery;
    // Native dialog cleanup restores its opener first; failed-navigation recovery owns the final editor focus.
    if (recovery.isCurrent()) focusPendingEditor(recovery.target);
  }, [busy, recovery]);

  /** A new intent: current while mounted, still the latest intent, `current()` holds and the view is unchanged. */
  const captureIntent = useCallback((current: () => boolean) => {
    const started = ++intent.current;
    const view = captureView();
    return () => mounted.current && started === intent.current && current() && view();
  }, []);
  /** The latest intent, without superseding it: false once any guarded command starts. */
  const captureHeld = useCallback(() => {
    const held = intent.current;
    return () => held === intent.current;
  }, []);
  const recover = useCallback((target: HTMLElement | null, isCurrent: () => boolean) => {
    setRecovery({ target, isCurrent });
  }, []);
  const clearRecovery = useCallback(() => setRecovery(null), []);
  const guard = useCallback(
    async (commit: () => void) => {
      const isCurrent = captureIntent(captureFocusGuard());
      const flush = editFlush();
      setRecovery(null);
      try {
        const saved = await flush.run();
        if (!isCurrent()) return;
        if (saved) commit();
        else {
          notify('Finish or correct the open rating or note before leaving this page.');
          recover(flush.target, isCurrent);
        }
      } catch (cause) {
        console.error('Navigation could not save pending edits.', cause);
        if (isCurrent()) {
          notify('Your edit could not be saved. Keep this page open and retry.');
          recover(flush.target, isCurrent);
        }
      }
    },
    [captureIntent, captureFocusGuard, notify, recover],
  );
  return { guard, captureIntent, captureHeld, recover, clearRecovery };
}
