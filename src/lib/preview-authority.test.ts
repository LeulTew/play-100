import { describe, expect, it, vi } from 'vitest';
import { accountScope } from './cloud-types';
import { createShelfPreviewAuthority } from './preview-authority';

describe('ephemeral shelf preview authority', () => {
  it('notifies an open preview when only that authorized shelf loses a game', () => {
    const shelf = createShelfPreviewAuthority(accountScope('viewer'), 'owner');
    const another = createShelfPreviewAuthority(accountScope('viewer'), 'other-owner');
    const listener = vi.fn(); const release = shelf.authority.subscribe(listener);
    shelf.update(['manual:a', 'manual:b']); another.update(['manual:a']);
    expect(shelf.authority.permits('manual:a')).toBe(true);
    shelf.update(['manual:b']);
    expect(shelf.authority.permits('manual:a')).toBe(false);
    expect(another.authority.permits('manual:a')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    shelf.update(['manual:b']); expect(listener).toHaveBeenCalledTimes(2);
    release(); shelf.update([]); expect(listener).toHaveBeenCalledTimes(2);
  });
  it('has no data or persistence authority and starts denied in a different account', () => {
    const old = createShelfPreviewAuthority(accountScope('viewer-a'), 'owner');
    old.update(['manual:one']);
    const current = createShelfPreviewAuthority(accountScope('viewer-b'), 'owner');
    expect(current.authority.permits('manual:one')).toBe(false);
    expect(current.authority.scope).not.toBe(old.authority.scope);
    old.update([]);
    expect(old.authority.permits('manual:one')).toBe(false);
  });
});
