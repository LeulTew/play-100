import { afterEach, describe, expect, it, vi } from 'vitest';
import { showLockedDialog } from './dialog-lifecycle';

afterEach(() => vi.unstubAllGlobals());

function fixture(gap = 15) {
  const calls: string[] = [];
  let overflow = 'clip';
  let padding = '3px';
  const style = {
    get overflow() { return overflow; },
    set overflow(value: string) { calls.push(`overflow:${value}`); overflow = value; },
    get paddingRight() { return padding; },
    set paddingRight(value: string) { calls.push(`padding:${value}`); padding = value; },
  };
  vi.stubGlobal('window', { innerWidth: 1440 });
  vi.stubGlobal('document', {
    documentElement: { get clientWidth() { calls.push('measure'); return 1440 - gap; } },
    body: { style },
  });
  const dialog = { showModal: vi.fn(() => { calls.push('showModal'); }) };
  const target = { focus: vi.fn(() => { calls.push('focus'); }) };
  return { calls, style, dialog, target };
}

describe('native dialog body-lock phases', () => {
  it('measures before showModal, then writes and focuses exactly once', () => {
    const { calls, dialog, target, style } = fixture();
    const release = showLockedDialog(dialog, target);
    try {
      expect(calls).toEqual(['measure', 'showModal', 'overflow:hidden', 'padding:15px', 'focus']);
      expect(target.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    } finally { release(); }
    expect(style).toMatchObject({ overflow: 'clip', paddingRight: '3px' });
    const count = calls.length;
    release();
    expect(calls).toHaveLength(count);
  });

  it('does not measure or replace the original body styles for a nested lock', () => {
    const { calls, dialog, target, style } = fixture();
    const outer = showLockedDialog(dialog, target);
    calls.length = 0;
    const nested = showLockedDialog(dialog, target);
    try {
      expect(calls).toEqual(['showModal', 'focus']);
      nested();
      expect(style.overflow).toBe('hidden');
    } finally { nested(); outer(); }
    expect(style).toMatchObject({ overflow: 'clip', paddingRight: '3px' });
  });

  it('keeps existing padding with overlay scrollbars and supports no explicit focus target', () => {
    const { calls, dialog, style } = fixture(0);
    const release = showLockedDialog(dialog, null);
    try {
      expect(calls).toEqual(['measure', 'showModal', 'overflow:hidden']);
      expect(style.paddingRight).toBe('3px');
    } finally { release(); }
  });

  it('does not acquire a body lock if native showModal fails', () => {
    const { calls, target, dialog } = fixture();
    expect(() => showLockedDialog({ showModal: () => { throw new Error('Native open failed'); } }, target)).toThrow('Native open failed');
    expect(calls).toEqual(['measure']);
    const release = showLockedDialog(dialog, target);
    try { expect(calls.filter(call => call === 'measure')).toHaveLength(2); }
    finally { release(); }
  });
});
