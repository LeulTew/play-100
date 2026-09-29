/**
 * Whether this browser has the Popover API: showPopover(), hidePopover() and the :popover-open selector (Chrome 114,
 * Firefox 125, Safari 17). Browsers from the documented floor up to those versions lack one or more of them, and a
 * selector the browser does not know makes matches() throw.
 */
export function popoverSupported(): boolean {
  if (typeof HTMLElement === 'undefined' || typeof document === 'undefined') return false;
  const element: Partial<Pick<HTMLElement, 'showPopover' | 'hidePopover'>> = HTMLElement.prototype;
  if (typeof element.showPopover !== 'function' || typeof element.hidePopover !== 'function') return false;
  try {
    document.createElement('div').matches(':popover-open');
    return true;
  } catch {
    return false;
  }
}
