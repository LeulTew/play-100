import { expect, it } from 'vitest';
import { trackNavigationKind } from './navigation-kind';

it('tells a document load, an app navigation and a history traversal apart', () => {
  const page = new EventTarget();
  const kind = trackNavigationKind(page);
  expect(kind()).toBe('load');
  page.dispatchEvent(new Event('play100:navigate'));
  expect(kind()).toBe('app');
  page.dispatchEvent(new Event('popstate'));
  expect(kind()).toBe('traverse');
  page.dispatchEvent(new Event('play100:navigate'));
  expect(kind()).toBe('app');
});

it('knows a traversal before a later listener of the same event runs, as React’s store subscription is', () => {
  const page = new EventTarget();
  const kind = trackNavigationKind(page);
  const seen: string[] = [];
  page.addEventListener('popstate', () => seen.push(kind()));
  page.dispatchEvent(new Event('popstate'));
  expect(seen).toEqual(['traverse']);
});
