import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChunkBoundary } from './ChunkBoundary';
import { ModuleLoadFailure } from '../lib/chunk-recovery';

describe('local lazy-module containment', () => {
  const children = createElement('p', null, 'Current page');
  const fallback = createElement('p', { role: 'alert' }, "This page didn't load.");
  it('preserves the normal subtree until an import fails', () => {
    const boundary = new ChunkBoundary({ children, fallback });
    expect(boundary.render()).toBe(children);
  });
  it('renders only the local fallback for the exact error React.lazy rethrows', () => {
    const boundary = new ChunkBoundary({ children, fallback });
    boundary.state = ChunkBoundary.getDerivedStateFromError(new ModuleLoadFailure(new Error('dependency')));
    expect(boundary.render()).toBe(fallback);
  });
  it('does not disguise unrelated render bugs as module failures', () => {
    const boundary = new ChunkBoundary({ children, fallback });
    const bug = new Error('Invalid render state');
    boundary.state = ChunkBoundary.getDerivedStateFromError(bug);
    expect(() => boundary.render()).toThrow(bug);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      boundary.componentDidCatch(bug);
      expect(log).not.toHaveBeenCalled();
      const failure = new ModuleLoadFailure(bug);
      boundary.componentDidCatch(failure);
      expect(log).toHaveBeenCalledWith('An app module did not load.', failure);
    } finally {
      log.mockRestore();
    }
  });
});
