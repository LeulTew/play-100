import { useContext, useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { visibleFocusTarget, visibleMenuTrigger } from '../lib/dialog-focus';
import { useMotionController } from '../motion/useMotion';
import type { DialogMotionHandle, DialogMotionOptions } from '../motion/types';
import { showLockedDialog } from './dialog-lifecycle';
import { DialogLayerContext, foregroundDialog, registerDialogLayer } from './dialog-layer';

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
  getOpener?: () => HTMLElement | null;
  getFallbackFocus?: () => HTMLElement | null;
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
  getOpener,
  getFallbackFocus,
  motion,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const visual = useRef<DialogMotionHandle | null>(null);
  const controller = useMotionController();
  const layer = useContext(DialogLayerContext);
  const latestMotion = useRef(motion);
  const motionDisabled = motion === false;
  const returnFocus = useRef(getReturnFocus);
  const close = useRef(onClose);
  const openerFocus = useRef({ getOpener, getFallbackFocus });
  useLayoutEffect(() => {
    latestMotion.current = motion;
    returnFocus.current = getReturnFocus;
    close.current = onClose;
    openerFocus.current = { getOpener, getFallbackFocus };
  }, [motion, getReturnFocus, getOpener, getFallbackFocus, onClose]);
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
    const opener = openerFocus.current.getOpener?.() ?? null;
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
      const foreground = foregroundDialog(dialog);
      const focused = document.activeElement;
      const canReturnTo = (target: HTMLElement | null): target is HTMLElement =>
        Boolean(
          target &&
          !dialog.contains(target) &&
          (!foreground || foreground.contains(target)) &&
          visibleFocusTarget(target),
        );
      const preferred = returnFocus.current?.() ?? null;
      const reveal = canReturnTo(preferred);
      let fallback = false;
      let target: HTMLElement | null;
      if (reveal) target = preferred;
      else if (foreground && focused instanceof HTMLElement && canReturnTo(focused)) target = focused;
      else if (canReturnTo(opener)) target = opener;
      else if (previousFocus instanceof HTMLElement && previousFocus !== document.body && canReturnTo(previousFocus))
        target = previousFocus;
      else {
        fallback = true;
        const linkedTarget = openerFocus.current.getFallbackFocus?.() ?? null;
        target = canReturnTo(linkedTarget)
          ? linkedTarget
          : foreground
            ? ([...foreground.querySelectorAll<HTMLElement>('[data-autofocus]')].find(canReturnTo) ?? foreground)
            : ([
                ...document.querySelectorAll<HTMLElement>(
                  '[data-page-heading][tabindex], #collection-title[tabindex], main h1[tabindex]',
                ),
              ].find(canReturnTo) ?? visibleMenuTrigger());
      }
      releaseLayer();
      dialog.close();
      unlock();
      if (fallback) {
        const afterClose = document.activeElement;
        queueMicrotask(() => {
          // Let a reopened or replacement dialog keep its own focus and page scroll.
          if (
            !dialog.open &&
            document.activeElement === afterClose &&
            visibleFocusTarget(target) &&
            target.closest('dialog') === foregroundDialog()
          ) {
            target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
            target.focus({ preventScroll: true });
          }
        });
      } else {
        if (reveal) target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        if (target && document.activeElement !== target) target.focus({ preventScroll: true });
      }
      controller.forgetDialog(dialog);
      runDialogMotion(() => ending?.closed());
    };
  }, [open, controller, layer]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    let pointer: number | null = null;
    const down = (event: PointerEvent) => {
      pointer =
        event.isPrimary && event.button === 0 && event.target === dialog && foregroundDialog() === dialog
          ? event.pointerId
          : null;
    };
    const up = (event: PointerEvent) => {
      const dismiss = pointer === event.pointerId && event.target === dialog && foregroundDialog() === dialog;
      pointer = null;
      if (dismiss) close.current();
    };
    const cancel = () => {
      pointer = null;
    };
    // A document-level pointer gesture keeps the accessible dialog itself free of a click action.
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-motion-owned={motion !== undefined ? 'true' : undefined}
      onKeyDown={(event) => {
        if (
          event.key !== 'Escape' ||
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          foregroundDialog() !== event.currentTarget
        )
          return;
        // Programmatic modal stacks can share a native close-watcher group; cancel the key, not each close request.
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
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
