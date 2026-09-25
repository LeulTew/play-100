import { createContext } from 'react';

export const DialogLayerContext = createContext(0);

const layers: { dialog: HTMLDialogElement; priority: number }[] = [];

export function registerDialogLayer(dialog: HTMLDialogElement, priority: number, previousFocus: Element | null) {
  const entry = { dialog, priority };
  const foreground = layers
    .filter((layer) => layer.priority > priority && layer.dialog.isConnected && layer.dialog.open)
    .sort((left, right) => left.priority - right.priority)
    .map((layer) => ({
      dialog: layer.dialog,
      top: layer.dialog.scrollTop,
      left: layer.dialog.scrollLeft,
    }));
  layers.push(entry);
  for (const layer of foreground) {
    // Reorder the native top layer without replacing React's mounted form or its body lock.
    layer.dialog.close();
    layer.dialog.showModal();
    layer.dialog.scrollTo({ top: layer.top, left: layer.left, behavior: 'instant' });
  }
  const top = foreground.at(-1)?.dialog;
  if (top) {
    const target =
      previousFocus instanceof HTMLElement &&
      previousFocus.isConnected &&
      top.contains(previousFocus) &&
      !previousFocus.matches(':disabled')
        ? previousFocus
        : top.querySelector<HTMLElement>('[data-autofocus]');
    if (target && document.activeElement !== target) target.focus({ preventScroll: true });
  }
  return () => {
    const index = layers.indexOf(entry);
    if (index !== -1) layers.splice(index, 1);
  };
}
