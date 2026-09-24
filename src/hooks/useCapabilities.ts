import { useEffect, useState } from 'react';
import type { MotionPreference } from '../lib/types';
import { isConstrainedDevice } from '../lib/device-capabilities';

interface ConnectionHint extends EventTarget {
  saveData?: boolean;
  effectiveType?: string;
}

interface HintedNavigator extends Navigator {
  deviceMemory?: number;
  connection?: ConnectionHint;
}

function readCapabilities() {
  const nav: HintedNavigator = navigator;
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    hidden: document.hidden,
    constrained: isConstrainedDevice(nav),
  };
}

export function useCapabilities(preference: MotionPreference) {
  const [capabilities, setCapabilities] = useState(readCapabilities);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(pointer: coarse)');
    const connection = (navigator as HintedNavigator).connection;
    const update = () =>
      setCapabilities((previous) => {
        const next = readCapabilities();
        return previous.reducedMotion === next.reducedMotion &&
          previous.coarsePointer === next.coarsePointer &&
          previous.hidden === next.hidden &&
          previous.constrained === next.constrained
          ? previous
          : next;
      });
    reduced.addEventListener('change', update);
    pointer.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    connection?.addEventListener('change', update);
    // Reconcile changes between the render-time snapshot and subscription.
    update();
    return () => {
      reduced.removeEventListener('change', update);
      pointer.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      connection?.removeEventListener('change', update);
    };
  }, []);
  const animate =
    !capabilities.reducedMotion &&
    !capabilities.hidden &&
    preference !== 'lite' &&
    (preference === 'full' || !capabilities.constrained);
  useEffect(() => {
    document.documentElement.dataset.motion = animate ? 'on' : 'off';
  }, [animate]);
  return { ...capabilities, animate };
}
