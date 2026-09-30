import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { OnlineBridge } from '../cloud/ui-types';
import { ONLINE_AVAILABLE, onlineWasRequested, resolveOnlineRequest } from '../lib/online-availability';
import { useLatest } from './useLatest';
import { loadStorageRecovery } from '../lib/storage-recovery-preload';
import type { RecoveryStage } from '../lib/storage-recovery-actions';

/**
 * Whether online tools were asked for, the bridge the account controller reports, whether it is still opening, and the
 * library scope, mode and header identity that bridge implies.
 */
export function useOnlineState() {
  const [onlineRequested, setOnlineRequested] = useState(onlineWasRequested);
  const [hintChecking, setHintChecking] = useState(ONLINE_AVAILABLE && !onlineRequested);
  const [hintError, publishHintError] = useState('');
  const [hintBlocked, setHintBlocked] = useState(false);
  const [recoveryStage, setRecoveryStage] = useState<RecoveryStage>('idle');
  const [online, setOnline] = useState<OnlineBridge | null>(null);
  const [onlineFailed, setOnlineFailed] = useState(false);
  const currentOnline = useLatest(online);
  const hintSequence = useRef(0);
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
    setRecoveryStage('idle');
  }, []);
  const reportHintError = useCallback((cause: unknown) => {
    publishHintError(
      cause === null ? '' : cause instanceof Error ? cause.message : 'The remembered account could not be checked.',
    );
    setHintBlocked(cause instanceof Error && cause.name === 'PersonalLibraryBlockedError');
  }, []);
  // Online tools that failed to open are no longer opening: the device library stays usable, and so does a reload.
  const controllerOpening = !onlineFailed && ((onlineRequested && online === null) || Boolean(online?.loading));
  const onlineOpening =
    ONLINE_AVAILABLE && (hintChecking || Boolean(hintError) || controllerOpening || recoveryStage !== 'idle');
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
  if (recoveryStage === 'account' && !controllerOpening) {
    publishHintError('');
    setHintBlocked(false);
    setRecoveryStage('idle');
  }
  const retryOpening = useCallback(
    (openDeviceLibrary: () => Promise<boolean>): Promise<boolean> => {
      return loadStorageRecovery()
        .then(({ retryAccountOpening }) =>
          retryAccountOpening(
            {
              currentOnline,
              hintSequence,
              alive,
              setStage: setRecoveryStage,
              setChecking: setHintChecking,
              setRequested: setOnlineRequested,
              reportError: reportHintError,
              resolveHint: resolveOnlineRequest,
            },
            openDeviceLibrary,
            online,
          ),
        )
        .catch((cause: unknown) => {
          if (alive.current) reportHintError(cause);
          return false;
        });
    },
    [currentOnline, reportHintError, online],
  );
  return {
    onlineRequested,
    setOnlineRequested,
    hintError,
    hintBlocked,
    retryingOpening: recoveryStage !== 'idle',
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
