import { describe, expect, it, vi } from 'vitest';
import { createRetryableModule } from './retryable-module';

describe('retryable modules used by credits, Settings and offline controls', () => {
  it('coalesces concurrent intents and exposes the resolved module synchronously', async () => {
    let resolve!: (value: { ready: boolean }) => void;
    const importer = vi.fn(() => new Promise<{ ready: boolean }>(done => { resolve = done; }));
    const resource = createRetryableModule(importer);
    const first = resource.load();
    const second = resource.load();
    expect(second).toBe(first);
    expect(resource.peek()).toBeNull();
    await Promise.resolve();
    const value = { ready: true };
    resolve(value);
    await expect(first).resolves.toBe(value);
    expect(resource.peek()).toBe(value);
    await expect(resource.load()).resolves.toBe(value);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it.each(['AboutDialog', 'SettingsPanel', 'PWA client'])('%s chunk rejection is handled and a subsequent attempt retries', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const importer = vi.fn<() => Promise<{ ready: boolean }>>()
        .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
        .mockResolvedValue({ ready: true });
      const resource = createRetryableModule(importer);
      const failure = vi.fn();
      await resource.load().catch(failure);
      expect(failure).toHaveBeenCalledOnce();
      expect(resource.peek()).toBeNull();
      await expect(resource.load()).resolves.toEqual({ ready: true });
      expect(importer).toHaveBeenCalledTimes(2);
      await new Promise(resolve => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally { process.off('unhandledRejection', unhandled); }
  });

  it('also releases a synchronously throwing import attempt', async () => {
    const importer = vi.fn<() => Promise<string>>()
      .mockImplementationOnce(() => { throw new Error('import shim failed'); })
      .mockResolvedValue('ready');
    const resource = createRetryableModule(importer);
    await expect(resource.load()).rejects.toThrow('import shim failed');
    await expect(resource.load()).resolves.toBe('ready');
  });
});
