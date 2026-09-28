import { describe, expect, it, vi } from 'vitest';
import { createValueStore } from './value-store';

describe('createValueStore', () => {
  it('notifies subscribers only when the value changes', () => {
    const store = createValueStore(1);
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.set(1);
    expect(listener).not.toHaveBeenCalled();
    store.set(2);
    expect(store.get()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    store.set(3);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toBe(3);
  });

  it('lets a listener unsubscribe another during a notification', () => {
    const store = createValueStore('a');
    const second = vi.fn();
    let stopSecond = () => {};
    store.subscribe(() => stopSecond());
    stopSecond = store.subscribe(second);
    store.set('b');
    expect(second).toHaveBeenCalledTimes(1);
    store.set('c');
    expect(second).toHaveBeenCalledTimes(1);
  });
});
