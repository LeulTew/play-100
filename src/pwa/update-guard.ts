import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { flushPendingEdits, hasPendingEdits } from '../hooks/useExitSave';
import { hasUnsubmittedPwaForm } from '../lib/pwa-update-guard';
import type { PwaUpdateGuard } from './types';

/** Counts every input and change event in the document, so an update can tell whether the user typed meanwhile. */
export function useInputGeneration(enabled = true): RefObject<number> {
  const generation = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const edited = () => {
      generation.current += 1;
    };
    document.addEventListener('input', edited, true);
    document.addEventListener('change', edited, true);
    return () => {
      document.removeEventListener('input', edited, true);
      document.removeEventListener('change', edited, true);
    };
  }, [enabled]);
  return generation;
}

interface PwaUpdateGuardOptions {
  isCurrent(): boolean;
  busy(): boolean;
  inputGeneration: RefObject<number>;
}

/**
 * The guard for one update request: any input after the request, a pending editor, an unsubmitted
 * form or a busy library blocks the reload. A later request captures the new input generation.
 */
export function createPwaUpdateGuard({ isCurrent, busy, inputGeneration }: PwaUpdateGuardOptions): PwaUpdateGuard {
  const edits = inputGeneration.current;
  return {
    isCurrent,
    prepare: async () => {
      if (!(await flushPendingEdits())) return false;
      if (hasUnsubmittedPwaForm())
        throw new Error(
          'Finish or clear unsubmitted forms, or return to The 100 before updating. Nothing was reloaded.',
        );
      return isCurrent();
    },
    canReload: () =>
      isCurrent() && !busy() && inputGeneration.current === edits && !hasPendingEdits() && !hasUnsubmittedPwaForm(),
  };
}
