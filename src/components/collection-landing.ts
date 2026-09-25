export function scrollCollectionIntoView(behavior: ScrollBehavior): void {
  const collection = document.getElementById('collection');
  if (!collection) return;
  const rootStyle = getComputedStyle(document.documentElement);
  const sectionStyle = getComputedStyle(collection);
  const preferredTop =
    window.scrollY +
    collection.getBoundingClientRect().top -
    (Number.parseFloat(rootStyle.scrollPaddingTop) || 0) -
    (Number.parseFloat(sectionStyle.scrollMarginTop) || 0);
  const identity = collection.querySelector<HTMLElement>('.game-card h3, tbody .table-game, .discovery-card h3');
  const heading = document.getElementById('collection-title');
  let focusTarget = heading;
  let top = preferredTop;
  if (identity) {
    const bounds = identity.getBoundingClientRect();
    const obstacles = Array.from(
      document.querySelectorAll<HTMLElement>('.compare-tray-dock, .compare-tray-error, .mobile-nav, .toast-visible'),
    ).filter((element) => element.getClientRects().length > 0);
    const bottom =
      Math.min(window.innerHeight, ...obstacles.map((element) => element.getBoundingClientRect().top)) - 12;
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
    // Keep native scrolling interruptible; never correct its position on later frames.
    const clearBottom = window.scrollY + bounds.bottom - bottom;
    const clearTop = window.scrollY + bounds.top - headerBottom - 12;
    top = Math.max(preferredTop, Math.min(clearBottom, clearTop));
    const headingBounds = heading?.getBoundingClientRect();
    const scrollDelta = Math.max(0, top) - window.scrollY;
    // Keep Explore's compact pinned landing stable when the dock's content changes height.
    const pinnedMobile = window.innerWidth <= 760 && obstacles.some((element) => element.matches('.compare-tray-dock'));
    if (
      pinnedMobile ||
      !headingBounds ||
      headingBounds.top - scrollDelta < headerBottom ||
      headingBounds.bottom - scrollDelta > bottom
    ) {
      focusTarget =
        identity.closest<HTMLAnchorElement>('a[href]') ??
        identity.querySelector<HTMLElement>('a[href], button') ??
        heading;
    }
  }
  window.scrollTo({ top: Math.max(0, top), behavior });
  if (focusTarget === heading && heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
  focusTarget?.focus({ preventScroll: true });
}
