import { describe, expect, it } from 'vitest';
import { throwIfAborted } from './abort';

describe('browser-floor abort checks', () => {
  it('accepts a live signal without throwIfAborted or reason and rejects it after cancellation', () => {
    const controller = new AbortController();
    Object.defineProperties(controller.signal, {
      throwIfAborted: { value: undefined },
      reason: { value: undefined },
    });
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(expect.objectContaining({ name: 'AbortError' }));
  });

  it.each([new Error('obsolete'), { obsolete: true }, null, false, 0, ''])(
    'preserves even falsy supported reasons: %s',
    (reason) => {
      const controller = new AbortController();
      Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined });
      controller.abort(reason);
      let thrown: unknown = 'not thrown';
      try {
        throwIfAborted(controller.signal);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(reason);
    },
  );
});
