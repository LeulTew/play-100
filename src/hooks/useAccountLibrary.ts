import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LibraryScope, ScopedLibrary } from '../lib/cloud-types';
import type { LibraryController } from '../lib/library-controller';
import type { PersonalAction, PersonalLibraryState } from '../lib/personal-types';
import { emptyPersonalLibrary } from '../lib/personal-library';
import {
  commitScopedAction,
  loadScopedLibrary,
  openScopedLibrary,
  restoreScopedLibrary,
  scopedWriter,
} from '../lib/scoped-library';
import type { AccountWriter } from '../lib/scoped-library';
import { subscribePersonalLibrary } from '../lib/personal-db';
import type { MotionPreference } from '../lib/types';
import type { ActionFeedback } from '../lib/action-message';

class AccountOpening {
  writer: AccountWriter | null = null;
  pending: Promise<ScopedLibrary> | null = null;

  constructor(
    readonly scope: LibraryScope | null,
    readonly authGeneration: number,
  ) {}

  async read(motion: MotionPreference, isCurrent: () => boolean): Promise<ScopedLibrary> {
    if (!this.scope) throw new Error('Open an account before saving its device copy.');
    if (this.writer) return loadScopedLibrary(this.writer, motion);
    const opening = this.pending ?? openScopedLibrary(this.scope, motion, isCurrent);
    this.pending = opening;
    try {
      const value = await opening;
      this.writer = scopedWriter(value);
      return value;
    } finally {
      if (this.pending === opening) this.pending = null;
    }
  }
}

function unavailableAccount(): Promise<never> {
  return Promise.reject(new Error('Reopen the signed-in account before saving its device copy.'));
}

export function useAccountLibrary(
  scope: LibraryScope | null,
  deviceMotion: MotionPreference,
  identityIsCurrent: () => boolean,
  authGeneration = 0,
) {
  const lifetime = useMemo(() => new AccountOpening(scope, authGeneration), [scope, authGeneration]);
  const [snapshot, setSnapshot] = useState<{ lifetime: AccountOpening; value: ScopedLibrary } | null>(null);
  const [failure, setFailure] = useState<{ lifetime: AccountOpening; message: string; retired?: boolean } | null>(null);
  const [pending, setPending] = useState(0);
  const currentLifetime = useRef(lifetime);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useLayoutEffect(() => {
    currentLifetime.current = lifetime;
  }, [lifetime]);
  const retryOpen = useCallback(() => {
    if (!scope) return Promise.resolve(false);
    return queue.current
      .then(async () => {
        const owns = () => currentLifetime.current === lifetime && identityIsCurrent();
        if (!owns()) return false;
        const value = await lifetime.read(deviceMotion, owns);
        if (owns()) {
          setSnapshot({ lifetime, value });
          setFailure(null);
          return true;
        }
        return false;
      })
      .catch((error: unknown) => {
        if (currentLifetime.current === lifetime)
          setFailure({
            lifetime,
            message: error instanceof Error ? error.message : 'Account device storage is unavailable.',
            retired: error instanceof Error && error.name === 'PersonalLibraryWriterRetiredError',
          });
        return false;
      });
  }, [scope, lifetime, deviceMotion, identityIsCurrent]);
  const refresh = useCallback(async () => {
    await retryOpen();
  }, [retryOpen]);
  useEffect(() => {
    if (!scope) return;
    void refresh();
    const unsubscribe = subscribePersonalLibrary(() => {
      void refresh();
    }, scope);
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', focus);
    };
  }, [scope, refresh]);
  const enqueue = useCallback(
    (operation: () => Promise<ScopedLibrary>): Promise<boolean> => {
      const target = scope;
      if (!target) return Promise.resolve(false);
      setPending((count) => count + 1);
      const task = queue.current.then(async () => {
        try {
          const next = await operation();
          if (currentLifetime.current === lifetime) {
            setSnapshot({ lifetime, value: next });
            setFailure(null);
          }
          return true;
        } catch (error) {
          if (currentLifetime.current === lifetime)
            setFailure({
              lifetime,
              message:
                error instanceof Error ? error.message : 'Your account change could not be saved on this device.',
              retired: error instanceof Error && error.name === 'PersonalLibraryWriterRetiredError',
            });
          return false;
        } finally {
          setPending((count) => count - 1);
        }
      });
      queue.current = task;
      return task;
    },
    [scope, lifetime],
  );
  const current = snapshot?.lifetime === lifetime ? snapshot.value : null;
  const writerGeneration = current?.writerGeneration ?? 0;
  const ready = current !== null;
  const writer = useMemo<AccountWriter | null>(
    () => (scope && ready ? { scope, generation: writerGeneration } : null),
    [scope, ready, writerGeneration],
  );
  const retired = Boolean(failure?.lifetime === lifetime && failure.retired);
  const perform = useCallback(
    (action: PersonalAction, feedback?: ActionFeedback) =>
      enqueue(() => (writer && !retired ? commitScopedAction(writer, action, feedback) : unavailableAccount())),
    [writer, retired, enqueue],
  );
  const restore = useCallback(
    (state: PersonalLibraryState) =>
      enqueue(() => (writer && !retired ? restoreScopedLibrary(writer, state) : unavailableAccount())),
    [writer, retired, enqueue],
  );
  const reset = useCallback(() => restore(emptyPersonalLibrary()), [restore]);
  const error = failure?.lifetime === lifetime ? failure.message : null;
  const controller = useMemo<LibraryController>(
    () => ({
      state: current?.state ?? emptyPersonalLibrary(),
      status: current ? 'ready' : error ? 'temporary' : 'loading',
      warning: null,
      error,
      busy: Boolean(retired) || pending > 0 || (!current && !error),
      perform,
      restore,
      reset,
      retryOpen,
    }),
    [current, error, retired, pending, perform, restore, reset, retryOpen],
  );
  useEffect(() => {
    if (!pending) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [pending]);
  return { snapshot: current, writer, controller, error, refresh, waitForWrites: () => queue.current };
}
