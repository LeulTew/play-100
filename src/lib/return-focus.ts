/** A focus target the user can reach now: connected, enabled, rendered and not inside a hidden, inert or closed layer. */
export function usableReturnFocusTarget(target: HTMLElement | null): target is HTMLElement {
  return Boolean(
    target?.isConnected &&
    !target.matches(':disabled') &&
    !target.closest('[hidden], [inert], dialog:not([open])') &&
    target.getClientRects().length > 0 &&
    getComputedStyle(target).visibility === 'visible',
  );
}

/** The Compare tray's action, or its expand button, when either can take focus. */
export function compareReturnFocusTarget(): HTMLElement | null {
  return (
    ['.compare-tray-action', '.compare-tray-expand']
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .find(usableReturnFocusTarget) ?? null
  );
}
