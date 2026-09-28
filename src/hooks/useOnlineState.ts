import { useEffect, useMemo, useState } from 'react';
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
  const [hintError, setHintError] = useState('');
  const [online, setOnline] = useState<OnlineBridge | null>(null);
  const [onlineFailed, setOnlineFailed] = useState(false);
  const currentOnline = useLatest(online);
  // Online tools that failed to open are no longer opening: the device library stays usable, and so does a reload.
  const controllerOpening = !onlineFailed && ((onlineRequested && online === null) || Boolean(online?.loading));
  const onlineOpening = ONLINE_AVAILABLE && (hintChecking || Boolean(hintError) || controllerOpening);
  const libraryScope = online?.scope ?? 'guest';
  const libraryMode = useMemo(
    () => ({
      scope: libraryScope,
      onlineEnabled: online?.enabled ?? false,
      label: onlineOpening ? 'Opening account…' : (online?.label ?? 'Device only'),
    }),
    [libraryScope, onlineOpening, online?.enabled, online?.label],
  );
  const headerIdentity =
    online?.identity && online.headerIdentity?.uid === online.identity.uid ? online.headerIdentity : null;
  useEffect(() => {
    if (!ONLINE_AVAILABLE) return;
    let alive = true;
    void resolveOnlineRequest()
      .then((requested) => {
        if (alive && requested) setOnlineRequested(true);
      })
      .catch((cause) => {
        if (alive)
          setHintError(cause instanceof Error ? cause.message : 'The remembered account could not be checked.');
      })
      .finally(() => {
        if (alive) setHintChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return {
    onlineRequested,
    setOnlineRequested,
    hintError,
    setHintError,
    online,
    setOnline,
    currentOnline,
    onlineFailed,
    setOnlineFailed,
    onlineOpening,
    libraryScope,
    libraryMode,
    headerIdentity,
  };
}
