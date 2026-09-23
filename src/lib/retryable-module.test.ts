import { describe, expect, it, vi } from 'vitest';
import { createRetryableModule } from './retryable-module';
import { isModuleLoadFailure } from './chunk-recovery';

describe('retryable modules used by credits, Settings and offline controls', () => {
  it('coalesces concurrent intents and exposes the resolved module synchronously', async () => {
    let resolve!: (value: { ready: boolean }) => void;
    const importer = vi.fn(() => new Promise<{ ready: boolean }>(done => { resolve = done; }));
    const resource = createRetryableModule(importer);
    expect(resource.started()).toBe(false);
    const first = resource.load();
    expect(resource.started()).toBe(true);
    const second = resource.load();
    expect(second).toBe(first);
    expect(resource.peek()).toBeNull();
    await Promise.resolve();
    const value = { ready: true };
    resolve(value);
    await expect(first).resolves.toBe(value);
    expect(resource.peek()).toBe(value);
    expect(resource.started()).toBe(true);
    await expect(resource.load()).resolves.toBe(value);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it.each(['AboutDialog', 'SettingsPanel', 'PWA client'])('%s chunk rejection is terminal without unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const importer = vi.fn<() => Promise<{ ready: boolean }>>()
        .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
        .mockResolvedValue({ ready: true });
      const resource = createRetryableModule(importer);
      const failure = vi.fn();
      const rejected = resource.load();
      await rejected.catch(failure);
      expect(failure).toHaveBeenCalledOnce();
      expect(isModuleLoadFailure(failure.mock.calls[0]![0])).toBe(true);
      expect(resource.peek()).toBeNull();
      expect(resource.started()).toBe(true);
      expect(resource.load()).toBe(rejected);
      await expect(resource.load()).rejects.toBe(failure.mock.calls[0]![0]);
      expect(importer).toHaveBeenCalledTimes(1);
      await new Promise(resolve => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally { process.off('unhandledRejection', unhandled); }
  });

  it('also retains a synchronously throwing import failure with its cause', async () => {
    const importer = vi.fn<() => Promise<string>>()
      .mockImplementationOnce(() => { throw new Error('import shim failed'); })
      .mockResolvedValue('ready');
    const resource = createRetryableModule(importer);
    const rejected = resource.load();
    await expect(rejected).rejects.toMatchObject({ cause: new Error('import shim failed') });
    expect(resource.load()).toBe(rejected);
    expect(importer).toHaveBeenCalledOnce();
  });
});
