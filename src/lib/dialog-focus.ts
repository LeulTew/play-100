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

export function visibleGameTrigger(id: string): HTMLElement | null {
  const value = CSS.escape(id);
  return (
    [
      ...document.querySelectorAll<HTMLElement>(
        `[data-game="${value}"] .game-link, [data-game="${value}"] .table-game a, ` +
          `[data-catalog-id="${value}"] h3 button, [data-record-id="${value}"] .record-title`,
      ),
    ].find((target) => !target.closest('dialog') && visibleFocusTarget(target)) ?? null
  );
}
