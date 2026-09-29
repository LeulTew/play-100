import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportClientError } from '../../lib/client-error-report';
import { DialogBoundary } from './DialogBoundary';

vi.mock('../../lib/client-error-report', () => ({ reportClientError: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe('dialog render error boundary', () => {
  it('renders a healthy dialog without closing or announcing it', () => {
    const props = {
      children: createElement('p', null, 'Healthy detail'),
      onClose: vi.fn(),
      onFailure: vi.fn(),
    };
    const boundary = new DialogBoundary(props);
    expect(boundary.render()).toBe(props.children);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onFailure).not.toHaveBeenCalled();
  });

  it('unmounts the failed child instead of retaining a broken native modal', () => {
    const boundary = new DialogBoundary({
      children: createElement('dialog', { open: true }, 'Broken child'),
      onClose: vi.fn(),
      onFailure: vi.fn(),
    });
    boundary.state = DialogBoundary.getDerivedStateFromError();
    expect(boundary.render()).toBeNull();
  });

  it('reports the existing route area and records recovery before clearing the open request', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const defer = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(() => {});
    const onClose = vi.fn();
    const onFailure = vi.fn();
    const boundary = new DialogBoundary({ children: null, onClose, onFailure });
    const error = new TypeError('Synthetic dialog failure');
    boundary.componentDidCatch(error, { componentStack: '\n    at Detail' });
    expect(reportClientError).toHaveBeenCalledWith(error, 'route');
    expect(log).toHaveBeenCalledWith(
      'A dialog could not render. The rest of Play 100 is still available.',
      error.message,
      '\n    at Detail',
    );
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onFailure.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]!);
    expect(defer).toHaveBeenCalledOnce();
  });
});
