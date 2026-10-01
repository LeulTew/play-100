let bodyLocks = 0;
let originalOverflow = '';
let originalPadding = '';

export function showLockedDialog(
  dialog: Pick<HTMLDialogElement, 'showModal'>,
  focusTarget: Pick<HTMLElement, 'focus' | 'autofocus'> | null,
) {
  // Read before showModal invalidates the document for native modal inertness.
  const firstLock = bodyLocks === 0;
  const gap = firstLock ? window.innerWidth - document.documentElement.clientWidth : 0;
  if (firstLock) {
    originalOverflow = document.body.style.overflow;
    originalPadding = document.body.style.paddingRight;
  }
  const autofocus = focusTarget?.autofocus ?? false;
  // Avoid a transient first-control announcement before the intended heading or safe action.
  if (focusTarget) focusTarget.autofocus = true;
  try {
    dialog.showModal();
  } catch (error) {
    if (focusTarget) focusTarget.autofocus = autofocus;
    throw error;
  }
  if (firstLock) {
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
  }
  bodyLocks += 1;
  if (focusTarget && !Object.is(document.activeElement, focusTarget)) focusTarget.focus({ preventScroll: true });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (focusTarget) focusTarget.autofocus = autofocus;
    bodyLocks -= 1;
    if (bodyLocks === 0) {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPadding;
    }
  };
}
