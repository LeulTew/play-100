import { useLayoutEffect } from 'react';

/**
 * The attributes components mirror onto <html> and <body> for the stylesheet, in place of html:has() and body:has()
 * rules. Chromium 106, the WebView of the 2 GB Galaxy A03s, rematches root :has() rules across the document on every
 * insertion: on that engine they cost about half of the style time of each update (docs/performance.md, "Low-end
 * phones"). Each attribute is present while its element is: the comparison chip (CompareTray), the visible toast
 * (AppToast) and the tray's reserve (AppShell).
 */
export const ROOT_FLAGS = {
  compareChip: 'data-compare-tray-chip',
  toast: 'data-toast-visible',
  trayReserve: 'data-compare-tray-reserve',
} as const;

/** How many holders ask for each attribute on each element. */
const holders = new WeakMap<Element, Map<string, number>>();

/** Sets an empty attribute while at least one holder asks for it, and returns this holder's release. */
export function holdRootFlag(element: Element, name: string): () => void {
  const counts = holders.get(element) ?? new Map<string, number>();
  holders.set(element, counts);
  counts.set(name, (counts.get(name) ?? 0) + 1);
  element.setAttribute(name, '');
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    const left = (counts.get(name) ?? 1) - 1;
    if (left > 0) {
      counts.set(name, left);
      return;
    }
    counts.delete(name);
    element.removeAttribute(name);
  };
}

/**
 * Mirrors `active` as the attribute `name` on <html> or <body> in the commit that changes it, before that commit
 * paints, as the :has() rule it replaces would have matched.
 */
export function useRootFlag(root: 'html' | 'body', name: string, active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    return holdRootFlag(root === 'html' ? document.documentElement : document.body, name);
  }, [root, name, active]);
}
