import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { OnlineBridge } from '../cloud/ui-types';
import { ONLINE_AVAILABLE, onlineWasRequested, resolveOnlineRequest } from '../lib/online-availability';
import { useLatest } from './useLatest';

/**
 * Whether online tools were asked for, the bridge the account controller reports, whether it is still opening, and the
 * library scope, mode and header identity that bridge implies.
 */
export function useOnlineState() {
  const [onlineRequested, setOnlineRequested] = useState(onlineWasRequested);
  const [hintChecking, setHintChecking] = useState(ONLINE_AVAILABLE && !onlineRequested);
  const [hintError, publishHintError] = useState('');
  const [hintBlocked, setHintBlocked] = useState(false);
  const [retryingHint, setRetryingHint] = useState(false);
  const [finishingRetry, setFinishingRetry] = useState(false);
  const [online, setOnline] = useState<OnlineBridge | null>(null);
  const [onlineFailed, setOnlineFailed] = useState(false);
  const currentOnline = useLatest(online);
  const hintSequence = useRef(0);
  const retryTask = useRef<Promise<boolean> | null>(null);
  const alive = useRef(true);
  useLayoutEffect(() => {
    const mounted = alive;
    const sequence = hintSequence;
    mounted.current = true;
    return () => {
      mounted.current = false;
      ++sequence.current;
    };
  }, []);
  const setHintError = useCallback((message: string) => {
    ++hintSequence.current;
    publishHintError(message);
    setHintBlocked(false);
    setHintChecking(false);
    setFinishingRetry(false);
  }, []);
  const reportHintError = useCallback((cause: unknown) => {
    publishHintError(cause instanceof Error ? cause.message : 'The remembered account could not be checked.');
    setHintBlocked(cause instanceof Error && cause.name === 'PersonalLibraryBlockedError');
  }, []);
  // Online tools that failed to open are no longer opening: the device library stays usable, and so does a reload.
  const controllerOpening = !onlineFailed && ((onlineRequested && online === null) || Boolean(online?.loading));
  const onlineOpening =
    ONLINE_AVAILABLE && (hintChecking || Boolean(hintError) || controllerOpening || retryingHint || finishingRetry);
  const libraryScope = online?.scope ?? 'guest';
  const libraryMode = useMemo(
    () => ({
      scope: libraryScope,
      onlineEnabled: online?.enabled ?? false,
      label: onlineOpening ? 'Opening account…' : (online?.label ?? 'Device only'),
    }),
    [libraryScope, onlineOpening, online?.enabled, online?.label],
  );
  // A guest with no remembered account sees a neutral "Account" until the check ends: "Opening account…" is for a known one.
  const headerLabel = onlineOpening && !onlineRequested ? '' : libraryMode.label;
  const headerIdentity =
    online?.identity && online.headerIdentity?.uid === online.identity.uid ? online.headerIdentity : null;
  useEffect(() => {
    if (!ONLINE_AVAILABLE) return;
    const currentSequence = hintSequence;
    const sequence = ++currentSequence.current;
    void resolveOnlineRequest()
      .then((requested) => {
        if (alive.current && sequence === hintSequence.current && requested) setOnlineRequested(true);
      })
      .catch((cause) => {
        if (alive.current && sequence === hintSequence.current) reportHintError(cause);
      })
      .finally(() => {
        if (alive.current && sequence === hintSequence.current) setHintChecking(false);
      });
    return () => {
      if (sequence === currentSequence.current) ++currentSequence.current;
    };
  }, [reportHintError]);
  if (finishingRetry && !controllerOpening) {
    publishHintError('');
    setHintBlocked(false);
    setFinishingRetry(false);
  }
  const retryOpening = useCallback(
    (openDeviceLibrary: () => Promise<boolean>): Promise<boolean> => {
      if (retryTask.current) return retryTask.current;
      const sequence = ++hintSequence.current;
      const identity = currentOnline.current?.identity?.uid;
      const scope = currentOnline.current?.scope;
      const isCurrent = () =>
        alive.current &&
        sequence === hintSequence.current &&
        currentOnline.current?.identity?.uid === identity &&
        currentOnline.current?.scope === scope;
      setRetryingHint(true);
      const task = (async () => {
        try {
          // Recover the device read first: its temporary-edit refusal must not be bypassed by account recovery.
          if (!(await openDeviceLibrary()) || !isCurrent()) return false;
          const requested = await resolveOnlineRequest();
          if (!isCurrent()) return false;
          const controller = currentOnline.current?.controller;
          if (controller?.retryOpen && !(await controller.retryOpen())) return false;
          if (!isCurrent()) return false;
          if (requested) {
            setOnlineRequested(true);
            setFinishingRetry(true);
          } else {
            publishHintError('');
            setHintBlocked(false);
          }
          return true;
        } catch (cause: unknown) {
          if (isCurrent()) reportHintError(cause);
          return false;
        } finally {
          if (alive.current) {
            setRetryingHint(false);
            if (isCurrent()) setHintChecking(false);
          }
        }
      })();
      retryTask.current = task;
      void task.then(() => {
        if (retryTask.current === task) retryTask.current = null;
      });
      return task;
    },
    [currentOnline, reportHintError],
  );
  return {
    onlineRequested,
    setOnlineRequested,
    hintError,
    hintBlocked,
    retryingOpening: retryingHint || finishingRetry,
    retryOpening,
    setHintError,
    online,
    setOnline,
    currentOnline,
    onlineFailed,
    setOnlineFailed,
    onlineOpening,
    libraryScope,
    libraryMode,
    headerLabel,
    headerIdentity,
  };
}
