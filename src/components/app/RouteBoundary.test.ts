import { createElement, isValidElement } from 'react';
import type { ErrorInfo, ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportClientError } from '../../lib/client-error-report';
import { ChunkBoundary } from '../ChunkBoundary';
import { RouteBoundary } from './RouteBoundary';
import { RouteHost } from './RouteHost';
import type { RouteHostProps } from './RouteHost';
import { routeBoundaryKey } from './route-boundary';

vi.mock('../../lib/client-error-report', () => ({ reportClientError: vi.fn() }));

/** Every element in a rendered tree, depth first, without rendering components. */
function elements(node: ReactNode): ReactElement<{ children?: ReactNode }>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const text = (node: ReactNode): string =>
  elements(node)
    .flatMap((element) => [element.props.children].flat())
    .filter((child): child is string => typeof child === 'string')
    .join(' ');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('route-level error boundary (REL-04)', () => {
  const children = createElement('p', null, 'Current page');

  it('renders the page until it throws', () => {
    const boundary = new RouteBoundary({ children });
    expect(boundary.render()).toBe(children);
  });

  it('replaces only the page with a recoverable error that keeps saved data', () => {
    const boundary = new RouteBoundary({ children });
    boundary.state = RouteBoundary.getDerivedStateFromError();
    const fallback = boundary.render();
    expect(text(fallback)).toContain('This page ran into a problem.');
    expect(text(fallback)).toContain("Your saved data hasn't changed");
    expect(
      elements(fallback).some(
        (element) => (element.props as { message?: string }).message === 'If it happens again, reload this page.',
      ),
    ).toBe(true);
    const retry = elements(fallback).find((element) => element.type === 'button');
    const setState = vi.spyOn(boundary, 'setState').mockImplementation(() => {});
    (retry?.props as { onClick?: () => void }).onClick?.();
    expect(setState).toHaveBeenCalledWith({ failed: false });
  });

  it('logs and reports the failure as a route error', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boundary = new RouteBoundary({ children });
    const bug = new Error('Invalid render state');
    boundary.componentDidCatch(bug, { componentStack: '\n    at Page' } as ErrorInfo);
    expect(log).toHaveBeenCalledWith(
      'A page could not render. The rest of Play 100 is still available.',
      'Invalid render state',
      '\n    at Page',
    );
    expect(reportClientError).toHaveBeenCalledWith(bug, 'route');
  });

  it('wraps each public page, keyed by route and scope, around its module boundary', () => {
    const render = (RouteHost as unknown as { type: (props: RouteHostProps) => ReactNode }).type;
    const tree = render({
      route: 'discover',
      scope: 'guest',
      online: null,
      content: { kind: 'private-library' },
    });
    const boundary = elements(tree).find((element) => element.type === RouteBoundary);
    expect(boundary?.key).toBe(routeBoundaryKey('discover', 'private-library', 'guest'));
    expect(elements(boundary?.props.children).some((element) => element.type === ChunkBoundary)).toBe(true);
  });
});
