import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { INDEXED_RELEASE_BATCH, PRIVATE_RELEASE_BATCH, runPayloadCleanup } from './generation-cleanup';

const denied = () => Object.assign(new Error('Rules do not support the countdown.'), { code: 'permission-denied' });

describe('bounded payload-cleanup compatibility', () => {
  it('keeps private release below the former zero-headroom transaction boundary in both rules and client', () => {
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    expect(PRIVATE_RELEASE_BATCH).toBe(2);
    expect(rules.match(/after\.released > released && after\.released <= released \+ (\d+)/)?.[1]).toBe(String(PRIVATE_RELEASE_BATCH));
    expect(INDEXED_RELEASE_BATCH).toBe(3);
    expect(rules.match(/after\.uploaded >= before\.uploaded - (\d+)/)?.[1]).toBe(String(INDEXED_RELEASE_BATCH));
  });
  it('falls back once on the first unsupported countdown and never retries it in a loop', async () => {
    const step = vi.fn(async () => { throw denied(); });
    const legacy = vi.fn(async () => {});
    const info = vi.spyOn(console, 'info');
    try {
      await runPayloadCleanup(55, step, legacy);
      expect(step).toHaveBeenCalledOnce();
      expect(legacy).toHaveBeenCalledOnce();
      expect(info).toHaveBeenCalledOnce();
    } finally { info.mockRestore(); }
  });
  it('does not downgrade after successful counted progress, an offline error, or a callback failure', async () => {
    const legacy = vi.fn(async () => {});
    const step = vi.fn<() => Promise<number | null>>().mockResolvedValueOnce(4).mockRejectedValueOnce(denied());
    await expect(runPayloadCleanup(3, step, legacy)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(runPayloadCleanup(3, async () => { throw Object.assign(new Error('Offline'), { code: 'unavailable' }); }, legacy))
      .rejects.toMatchObject({ code: 'unavailable' });
    await expect(runPayloadCleanup(3, async () => 0, legacy, async () => { throw denied(); }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(runPayloadCleanup(3, async () => { throw denied(); }, legacy, undefined, false))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(legacy).not.toHaveBeenCalled();
  });
  it('terminates on zero or already-released payload and surfaces nonprogress instead of freeing a slot', async () => {
    const legacy = vi.fn(async () => {});
    const step = vi.fn<() => Promise<number | null>>().mockResolvedValueOnce(4).mockResolvedValueOnce(0);
    await runPayloadCleanup(3, step, legacy);
    expect(step).toHaveBeenCalledTimes(2);
    const callback = vi.fn(async () => {});
    await runPayloadCleanup(1, async () => null, legacy, callback);
    expect(callback).not.toHaveBeenCalled();
    await expect(runPayloadCleanup(2, async () => 4, legacy)).rejects.toThrow('Some saved copies still need cleanup. Refresh the page, then try again.');
    expect(legacy).not.toHaveBeenCalled();
  });
});
