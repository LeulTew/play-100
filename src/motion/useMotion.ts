import { useContext } from 'react';
import { MotionControllerContext, MotionPolicyContext } from './context';
import type { MotionPolicy, MotionRuntime } from './types';

export function useMotionRuntime(): MotionRuntime {
  return useContext(MotionControllerContext);
}

export function useMotionPolicy(): MotionPolicy {
  return useContext(MotionPolicyContext);
}

export function useMotionController() {
  return useContext(MotionControllerContext);
}
