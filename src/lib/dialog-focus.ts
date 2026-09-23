export function visibleFocusTarget(target: HTMLElement | null): target is HTMLElement {
  return Boolean(target?.isConnected && !target.matches(':disabled') && !target.closest('[hidden], [inert], dialog:not([open])') &&
    target.getClientRects().length > 0 && getComputedStyle(target).visibility === 'visible');
}

export function visibleMenuTrigger() {
  return [...document.querySelectorAll<HTMLElement>('.menu-nav, .mobile-nav button[aria-haspopup="dialog"]')].find(visibleFocusTarget) ?? null;
}
