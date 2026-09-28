import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPendingEditor } from '../hooks/useExitSave';
import { editFlush } from './edit-flush';

const target = { id: 'rating' } as unknown as HTMLElement;
const cleanups: (() => Promise<boolean>)[] = [];

function editor(flush: () => Promise<boolean>) {
  const state = { pending: true };
  const unregister = registerPendingEditor({ pending: () => state.pending, flush, focusTarget: () => target });
  cleanups.push(() => {
    state.pending = false;
    return unregister();
  });
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('editFlush', () => {
  it('resolves true with no blocking editor when the open edits save', async () => {
    const flush = vi.fn(async () => true);
    editor(flush);
    const run = editFlush();
    await expect(run.run()).resolves.toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(run.target).toBeNull();
  });

  it('remembers the editor an invalid edit blocked on', async () => {
    editor(async () => false);
    const run = editFlush();
    await expect(run.run()).resolves.toBe(false);
    expect(run.target).toBe(target);
  });

  it('remembers the editor whose save failed, and rejects', async () => {
    editor(async () => {
      throw new Error('Storage failed.');
    });
    const run = editFlush();
    await expect(run.run()).rejects.toThrow('Storage failed.');
    expect(run.target).toBe(target);
  });
});
