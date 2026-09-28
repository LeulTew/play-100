import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MotionRuntime } from '../../motion';
import { discoveryFixture } from '../../lib/discovery-test-fixtures';
import { createCompareTrayBinding } from './compare-tray-binding';

const runtime: MotionRuntime = {
  originHint: () => null,
  captureOrigin: () => null,
  startMotionSession: () => null,
  cancel: () => {},
  subscribeInterrupt: () => () => {},
};

afterEach(() => vi.unstubAllGlobals());

describe('committed compare-tray ownership', () => {
  it('does not read storage or accept writes from an uncommitted binding', () => {
    const getStorage = vi.fn(() => {
      throw new Error('Uncommitted bindings must not access storage.');
    });
    vi.stubGlobal('window', {
      get localStorage() {
        return getStorage();
      },
    });
    const binding = createCompareTrayBinding('guest', runtime);
    binding.store.reload();
    expect(binding.store.pin(discoveryFixture.record)).toBe(false);
    expect(binding.controller.canPin()).toBe(false);
    expect(getStorage).not.toHaveBeenCalled();
  });

  it('keeps the current binding active when a replacement render is discarded', () => {
    const binding = createCompareTrayBinding('guest', runtime);
    const deactivate = binding.activate();
    const abandoned = createCompareTrayBinding('account:demo-play100:other', runtime);
    expect(binding.controller.canPin()).toBe(true);
    expect(abandoned.controller.canPin()).toBe(false);
    deactivate();
    expect(binding.controller.canPin()).toBe(false);
    expect(binding.store.pin(discoveryFixture.record)).toBe(false);
  });

  it('supports commit rehearsal and uses only the latest committed interaction gate', () => {
    const binding = createCompareTrayBinding('guest', runtime);
    binding.activate()();
    const deactivate = binding.activate();
    binding.setInteraction({ enabled: false, captureCurrent: () => ({ isCurrent: () => true }) });
    expect(binding.controller.canPin()).toBe(false);
    binding.setInteraction({ enabled: true, captureCurrent: () => ({ isCurrent: () => true }) });
    expect(binding.controller.canPin()).toBe(true);
    deactivate();
    expect(binding.controller.canPin()).toBe(false);
  });
});
