import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OnlineBoundary } from './OnlineBoundary';
import { reportClientError } from '../lib/client-error-report';

vi.mock('../lib/client-error-report', () => ({ reportClientError: vi.fn() }));

describe('online tools containment', () => {
  const children = createElement('p', null, 'Account');

  it('tells the app when the online tools fail, and when that failed boundary unmounts', () => {
    const onFailedChange = vi.fn();
    const boundary = new OnlineBoundary({ children, onDevice: vi.fn(), onFailedChange });
    expect(boundary.render()).toBe(children);
    boundary.componentDidMount();
    boundary.componentWillUnmount();
    expect(onFailedChange).not.toHaveBeenCalled();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      boundary.state = OnlineBoundary.getDerivedStateFromError();
      boundary.componentDidCatch(new Error('Account restoration timed out.'));
      expect(warn).toHaveBeenCalledOnce();
      expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), 'online');
      expect(reportClientError).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
    expect(boundary.render()).not.toBe(children);
    expect(onFailedChange.mock.calls).toEqual([[true]]);
    // Development's StrictMode unmounts and remounts a boundary that failed as it mounted; the remount reports it again.
    boundary.componentWillUnmount();
    boundary.componentDidMount();
    expect(onFailedChange.mock.calls).toEqual([[true], [false], [true]]);
    // The next boundary starts unfailed, so the app must stop treating the online tools as failed.
    boundary.componentWillUnmount();
    expect(onFailedChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });
});
