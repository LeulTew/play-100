import { createContext } from 'react';
import { createMotionRuntime } from './runtime';
import type { MotionController, MotionPolicy, MotionSnapshot } from './types';

export const staticMotionPolicy: MotionPolicy = {
  animate: false,
  reducedMotion: false,
  coarsePointer: false,
  hidden: false,
  constrained: false,
};
const staticSnapshot: MotionSnapshot = {
  policy: staticMotionPolicy,
  boundary: { scopeKey: '', generation: 0, blocked: true },
  location: {
    viewKey: '',
    requestedDetailKey: null,
    displayedDetailKey: null,
    navigationGeneration: 0,
    overlayKey: null,
  },
};

export const MotionControllerContext = createContext<MotionController>(
  createMotionRuntime(
    () => staticSnapshot,
    () => null,
  ),
);
export const MotionPolicyContext = createContext<MotionPolicy>(staticMotionPolicy);
