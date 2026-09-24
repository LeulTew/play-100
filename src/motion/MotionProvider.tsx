import { useLayoutEffect, useRef, useState } from 'react';
import { MotionControllerContext, MotionPolicyContext } from './context';
import { createMotionRuntime } from './runtime';
import type { MotionProviderProps, MotionSnapshot } from './types';

export function MotionProvider({ policy, boundary, location, children }: MotionProviderProps) {
  const snapshot = useRef<MotionSnapshot>({ policy, boundary, location });
  snapshot.current = { policy, boundary, location };
  const host = useRef<HTMLDivElement>(null);
  const [controller] = useState(() =>
    createMotionRuntime(
      () => snapshot.current,
      () => host.current,
    ),
  );
  useLayoutEffect(() => {
    controller.mount();
    return () => controller.dispose();
  }, [controller]);
  useLayoutEffect(() => {
    controller.update();
  });
  return (
    <MotionControllerContext.Provider value={controller}>
      <MotionPolicyContext.Provider value={policy}>
        {children}
        <div ref={host} className="motion-return-host" data-motion-host="root" aria-hidden="true" inert />
      </MotionPolicyContext.Provider>
    </MotionControllerContext.Provider>
  );
}
