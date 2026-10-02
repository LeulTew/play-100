import { foregroundDialog } from '../components/dialog-layer';
import { focusPendingEditor } from './dialog-focus';

/** A single handoff from an action that becomes unavailable, never from a newer focus or navigation. */
export function captureControlFocus(control: HTMLElement | null) {
  let current = control !== null && document.activeElement === control;
  const href = window.location.href;
  const dialog = control?.closest('dialog') ?? null;
  const invalidate = () => {
    current = false;
  };
  const moved = (event: FocusEvent) => {
    if (event.target !== control) invalidate();
  };
  const cancel = () => {
    invalidate();
    document.removeEventListener('focusin', moved, true);
    window.removeEventListener('popstate', invalidate);
    window.removeEventListener('play100:navigate', invalidate);
  };
  if (current) {
    document.addEventListener('focusin', moved, true);
    window.addEventListener('popstate', invalidate);
    window.addEventListener('play100:navigate', invalidate);
  }
  return {
    cancel,
    focus(target: HTMLElement | null) {
      const allowed =
        current &&
        window.location.href === href &&
        control !== null &&
        (!control.isConnected || control.matches(':disabled, [aria-disabled="true"]')) &&
        (document.activeElement === control || document.activeElement === document.body) &&
        target?.closest('dialog') === dialog &&
        foregroundDialog() === dialog;
      cancel();
      return Boolean(allowed && focusPendingEditor(target));
    },
  };
}
