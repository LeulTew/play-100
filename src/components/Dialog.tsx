import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { visibleFocusTarget, visibleMenuTrigger } from '../lib/dialog-focus';
import { useMotionController } from '../motion/useMotion';
import type { DialogMotionHandle, DialogMotionOptions } from '../motion/types';

let bodyLocks = 0;
let originalOverflow = '';
let originalPadding = '';

function runDialogMotion(work: () => void) {
  try { work(); }
  catch { console.error('Dialog motion failed. Native dialog behavior remains available.'); }
}

function lockBody() {
  if (bodyLocks === 0) {
    originalOverflow = document.body.style.overflow;
    originalPadding = document.body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
  }
  bodyLocks += 1;
  return () => {
    bodyLocks -= 1;
    if (bodyLocks === 0) {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPadding;
    }
  };
}

interface DialogProps {
  open: boolean;
  titleId: string;
  descriptionId?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  getReturnFocus?: () => HTMLElement | null;
  motion?: false | DialogMotionOptions;
}

export function Dialog({ open, titleId, descriptionId, onClose, children, className = '', getReturnFocus, motion }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const visual = useRef<DialogMotionHandle | null>(null);
  const controller = useMotionController();
  const latestMotion = useRef(motion);
  latestMotion.current = motion;
  const motionDisabled = motion === false;
  const returnFocus = useRef(getReturnFocus);
  returnFocus.current = getReturnFocus;
  useLayoutEffect(() => {
    const current = visual;
    return () => { runDialogMotion(() => current.current?.prepareClose()); };
  }, [open]);
  useLayoutEffect(() => { if (motionDisabled) runDialogMotion(() => visual.current?.cancel()); }, [motionDisabled]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    const unlock = lockBody();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    runDialogMotion(() => {
      if (inner.current) visual.current = controller.openDialog(dialog, inner.current, slot.current, latestMotion.current);
    });
    return () => {
      const ending = visual.current;
      visual.current = null;
      dialog.close();
      unlock();
      const preferred = returnFocus.current?.() ?? null;
      if (visibleFocusTarget(preferred)) {
        preferred.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        preferred.focus({ preventScroll: true });
      } else if (previousFocus instanceof HTMLElement && previousFocus !== document.body && visibleFocusTarget(previousFocus)) {
        previousFocus.focus({ preventScroll: true });
      } else {
        ([...document.querySelectorAll<HTMLElement>('[data-page-heading][tabindex], #collection-title[tabindex], main h1[tabindex]')].find(visibleFocusTarget) ??
          visibleMenuTrigger())?.focus({ preventScroll: true });
      }
      controller.forgetDialog(dialog);
      runDialogMotion(() => ending?.closed());
    };
  }, [open, controller]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-motion-owned={motion !== undefined ? 'true' : undefined}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="dialog-inner" ref={inner}>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button>
        {children}
      </div>
      {motion && <div ref={slot} className="dialog-motion-slot" data-motion-host="dialog" aria-hidden="true" inert />}
    </dialog>
  );
}
