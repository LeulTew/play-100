let bodyLocks = 0;
let originalOverflow = '';
let originalPadding = '';

export function showLockedDialog(
  dialog: Pick<HTMLDialogElement, 'showModal'>,
  focusTarget: Pick<HTMLElement, 'focus'> | null,
) {
  // Read before showModal invalidates the document for native modal inertness.
  const firstLock = bodyLocks === 0;
  const gap = firstLock ? window.innerWidth - document.documentElement.clientWidth : 0;
  if (firstLock) {
    originalOverflow = document.body.style.overflow;
    originalPadding = document.body.style.paddingRight;
  }
  dialog.showModal();
  if (firstLock) {
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
  }
  bodyLocks += 1;
  focusTarget?.focus({ preventScroll: true });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyLocks -= 1;
    if (bodyLocks === 0) {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPadding;
    }
  };
}
