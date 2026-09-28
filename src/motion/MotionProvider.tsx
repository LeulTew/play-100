import { useLayoutEffect, useState } from 'react';
import { MotionControllerContext, MotionPolicyContext } from './context';
import { createMotionRuntime } from './runtime';
import type { MotionProviderProps, MotionSnapshot } from './types';

function createMotionBinding(initial: MotionSnapshot) {
  let snapshot = initial;
  let host: HTMLDivElement | null = null;
  return {
    controller: createMotionRuntime(
      () => snapshot,
      () => host,
    ),
    setSnapshot(next: MotionSnapshot) {
      snapshot = next;
    },
    setHost(node: HTMLDivElement | null) {
      host = node;
    },
  };
}

export function MotionProvider({ policy, boundary, location, children }: MotionProviderProps) {
  const [binding] = useState(() => createMotionBinding({ policy, boundary, location }));
  const { controller } = binding;
  useLayoutEffect(() => {
    binding.setSnapshot({ policy, boundary, location });
  });
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
        <div
          ref={(node) => binding.setHost(node)}
          className="motion-return-host"
          data-motion-host="root"
          aria-hidden="true"
          inert
        />
      </MotionPolicyContext.Provider>
    </MotionControllerContext.Provider>
  );
}
