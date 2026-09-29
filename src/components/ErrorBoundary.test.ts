import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { reportClientError } from '../lib/client-error-report';

vi.mock('../lib/client-error-report', () => ({ reportClientError: vi.fn() }));

describe('app fault reporting', () => {
  it('reports the error and area without changing the local recovery UI', () => {
    const children = createElement('p', null, 'Collection');
    const boundary = new ErrorBoundary({ children });
    expect(boundary.render()).toBe(children);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const error = new Error('private message');
      boundary.state = ErrorBoundary.getDerivedStateFromError();
      boundary.componentDidCatch(error, { componentStack: 'private stack' });
      expect(reportClientError).toHaveBeenCalledWith(error, 'app');
      expect(reportClientError).toHaveBeenCalledOnce();
      expect(boundary.render()).not.toBe(children);
    } finally { log.mockRestore(); }
  });
});
