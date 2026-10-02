import { afterEach, describe, expect, it, vi } from 'vitest';
import { withActionCleanup } from '../tests/action-cleanup';

afterEach(() => vi.restoreAllMocks());

describe('action probe cleanup', () => {
  it('keeps the exact primary failure while reporting cleanup failures and disposing every probe', async () => {
    const primary = new Error('Primary preview or focus assertion.');
    const secondary = new Error('Execution context was destroyed.');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispose = vi.fn(async () => {});
    await expect(
      withActionCleanup(async () => {
        throw primary;
      }, [
        async () => {
          throw secondary;
        },
        dispose,
      ]),
    ).rejects.toBe(primary);
    expect(dispose).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      'Action cleanup also failed after the primary test failure.',
      secondary,
    );
  });

  it('fails a passing test when cleanup fails, without skipping later cleanup', async () => {
    const first = new Error('Restore failed.');
    const second = new Error('Dispose failed.');
    const dispose = vi.fn(async () => {
      throw second;
    });
    await expect(
      withActionCleanup(async () => {}, [
        async () => {
          throw first;
        },
        dispose,
      ]),
    ).rejects.toMatchObject({ name: 'AggregateError', errors: [first, second] });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('cleans up a successful action without manufacturing a failure', async () => {
    const restore = vi.fn(async () => {});
    const dispose = vi.fn(async () => {});
    await expect(withActionCleanup(async () => {}, [restore, dispose])).resolves.toBeUndefined();
    expect(restore.mock.invocationCallOrder[0]).toBeLessThan(dispose.mock.invocationCallOrder[0]!);
  });
});
