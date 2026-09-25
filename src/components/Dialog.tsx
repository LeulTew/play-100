import { useContext, useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { visibleFocusTarget, visibleMenuTrigger } from '../lib/dialog-focus';
import { useMotionController } from '../motion/useMotion';
import type { DialogMotionHandle, DialogMotionOptions } from '../motion/types';
import { showLockedDialog } from './dialog-lifecycle';
import { DialogLayerContext, registerDialogLayer } from './dialog-layer';

function runDialogMotion(work: () => void) {
  try {
    work();
  } catch {
    console.error('Dialog motion failed. Native dialog behavior remains available.');
  }
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

export function Dialog({
  open,
  titleId,
  descriptionId,
  onClose,
  children,
  className = '',
  getReturnFocus,
  motion,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const visual = useRef<DialogMotionHandle | null>(null);
  const controller = useMotionController();
  const layer = useContext(DialogLayerContext);
  const latestMotion = useRef(motion);
  latestMotion.current = motion;
  const motionDisabled = motion === false;
  const returnFocus = useRef(getReturnFocus);
  returnFocus.current = getReturnFocus;
  useLayoutEffect(() => {
    const current = visual;
    return () => {
      runDialogMotion(() => current.current?.prepareClose());
    };
  }, [open]);
  useLayoutEffect(() => {
    if (motionDisabled) runDialogMotion(() => visual.current?.cancel());
  }, [motionDisabled]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previousFocus = document.activeElement;
    const focusTarget = dialog.querySelector<HTMLElement>('[data-autofocus]');
    const unlock = showLockedDialog(dialog, focusTarget);
    const releaseLayer = registerDialogLayer(dialog, layer, previousFocus);
    runDialogMotion(() => {
      if (inner.current)
        visual.current = controller.openDialog(dialog, inner.current, slot.current, latestMotion.current);
    });
    return () => {
      const ending = visual.current;
      visual.current = null;
      const canReturnTo = (target: HTMLElement | null): target is HTMLElement =>
        Boolean(target && !dialog.contains(target) && visibleFocusTarget(target));
      const preferred = returnFocus.current?.() ?? null;
      const reveal = canReturnTo(preferred);
      const target = reveal
        ? preferred
        : previousFocus instanceof HTMLElement && previousFocus !== document.body && canReturnTo(previousFocus)
          ? previousFocus
          : ([
              ...document.querySelectorAll<HTMLElement>(
                '[data-page-heading][tabindex], #collection-title[tabindex], main h1[tabindex]',
              ),
            ].find(canReturnTo) ?? visibleMenuTrigger());
      releaseLayer();
      dialog.close();
      unlock();
      if (reveal) target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      if (target && document.activeElement !== target) target.focus({ preventScroll: true });
      controller.forgetDialog(dialog);
      runDialogMotion(() => ending?.closed());
    };
  }, [open, controller, layer]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-motion-owned={motion !== undefined ? 'true' : undefined}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner" ref={inner}>
        <div className="dialog-close-rail">
          <button className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
      {motion && <div ref={slot} className="dialog-motion-slot" data-motion-host="dialog" aria-hidden="true" inert />}
    </dialog>
  );
}
