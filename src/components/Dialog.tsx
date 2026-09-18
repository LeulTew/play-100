import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

let bodyLocks = 0;
let originalOverflow = '';
let originalPadding = '';

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
}

export function Dialog({ open, titleId, descriptionId, onClose, children, className = '' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    const unlock = lockBody();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      unlock();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.matches(':disabled')) {
        previousFocus.focus({ preventScroll: true });
      } else {
        document.querySelector<HTMLElement>('[data-page-heading], #collection-title')?.focus({ preventScroll: true });
      }
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="dialog-inner">
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button>
        {children}
      </div>
    </dialog>
  );
}
