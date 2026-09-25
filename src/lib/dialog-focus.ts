export function visibleFocusTarget(target: HTMLElement | null): target is HTMLElement {
  return Boolean(
    target?.isConnected &&
    !target.matches(':disabled') &&
    !target.closest('[hidden], [inert], dialog:not([open])') &&
    target.getClientRects().length > 0 &&
    getComputedStyle(target).visibility === 'visible',
  );
}

export function focusPendingEditor(target: HTMLElement | null): boolean {
  if (!visibleFocusTarget(target)) return false;
  target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}

export function visibleMenuTrigger() {
  return (
    [...document.querySelectorAll<HTMLElement>('.menu-nav, .mobile-nav button[aria-haspopup="dialog"]')].find(
      visibleFocusTarget,
    ) ?? null
  );
}
