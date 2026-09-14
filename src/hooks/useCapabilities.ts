import { useEffect, useState } from 'react';
import type { MotionPreference } from '../lib/types';

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
    constrained: Boolean(
      nav.connection?.saveData ||
      ['slow-2g', '2g'].includes(nav.connection?.effectiveType ?? '') ||
      (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) ||
      (nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2),
    ),
  };
}

export function useCapabilities(preference: MotionPreference) {
  const [capabilities, setCapabilities] = useState(readCapabilities);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(pointer: coarse)');
    const connection = (navigator as HintedNavigator).connection;
    const update = () => setCapabilities(readCapabilities());
    reduced.addEventListener('change', update);
    pointer.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    connection?.addEventListener('change', update);
    return () => {
      reduced.removeEventListener('change', update);
      pointer.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      connection?.removeEventListener('change', update);
    };
  }, []);
  const animate = !capabilities.reducedMotion && !capabilities.hidden && preference !== 'lite' &&
    (preference === 'full' || !capabilities.constrained);
  useEffect(() => {
    document.documentElement.dataset.motion = animate ? 'on' : 'off';
  }, [animate]);
  return { ...capabilities, animate };
}
