import { createCompareDragSession, createCompareTrayStore } from '../../lib/compare-tray';
import type { MotionRuntime } from '../../motion';
import type { CompareInteractionGate } from './compare-drag-types';
import { createCompareDragController } from './compare-drag-controller';

export function createCompareTrayBinding(scope: string, runtime: MotionRuntime) {
  let current = false;
  let interaction: CompareInteractionGate | undefined;
  const isCurrent = () => current;
  const store = createCompareTrayStore(scope, () => window.localStorage, isCurrent);
  const drag = createCompareDragSession(scope, store, isCurrent);
  const controller = createCompareDragController({
    store,
    drag,
    runtime,
    isCurrent,
    interaction: () => interaction,
  });
  return {
    store,
    controller,
    setInteraction(next: CompareInteractionGate | undefined) {
      interaction = next;
    },
    activate() {
      current = true;
      controller.resume();
      return () => {
        current = false;
        controller.dispose();
      };
    },
  };
}
