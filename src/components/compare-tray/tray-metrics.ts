import { afterNextPaint } from '../../lib/after-paint';

/** The heights CompareTray keeps as custom properties on <html>, for layout that must clear the fixed chrome. */
export const TRAY_METRIC_PROPERTIES = [
  '--site-header-height',
  '--mobile-nav-height',
  '--toast-height',
  '--compare-tray-height',
] as const;

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
}
interface Measurable {
  getBoundingClientRect(): Box;
}
interface RootStyle {
  getPropertyValue(property: string): string;
  setProperty(property: string, value: string): void;
  removeProperty(property: string): string;
}

export interface TrayMetricTargets {
  /** The inline style of <html>. */
  readonly style: RootStyle;
  readonly header: Measurable | null;
  readonly navigation: Measurable | null;
  readonly toast: Measurable | null;
  /** The dock while the tray shows, else null. */
  readonly tray: (Measurable & { querySelectorAll(selectors: string): ArrayLike<Measurable> }) | null;
}

const height = (element: Measurable | null) =>
  element ? `${Math.ceil(element.getBoundingClientRect().height)}px` : null;

/**
 * Measures every height first and only then writes the ones that changed. A custom property written
 * on <html> invalidates the style of the whole document, so a read after a write forces a full style
 * recalculation: measuring in between writes would force one per element. A missing element or a
 * hidden tray removes its property.
 */
export function measureTrayMetrics({ style, header, navigation, toast, tray }: TrayMetricTargets): void {
  let trayHeight: string | null = null;
  if (tray) {
    const bounds = tray.getBoundingClientRect();
    const top = Math.min(
      bounds.top,
      ...Array.from(
        tray.querySelectorAll('.compare-tray-error, .compare-tray-storage-mark'),
        (element) => element.getBoundingClientRect().top,
      ),
    );
    trayHeight = `${Math.ceil(bounds.bottom - top)}px`;
  }
  const values = [height(header), height(navigation), height(toast), trayHeight];
  TRAY_METRIC_PROPERTIES.forEach((property, index) => {
    const value = values[index] ?? null;
    if (value === null) {
      if (style.getPropertyValue(property)) style.removeProperty(property);
    } else if (style.getPropertyValue(property) !== value) {
      style.setProperty(property, value);
    }
  });
}

/**
 * When CompareTray measures. Before anything is measured, with no tray to place, the first resize notification waits
 * until the page has painted (afterNextPaint): the metrics then set after the first paint, whose style and layout run
 * once instead of twice for heights that page has no use for yet. From then on a notification measures at once, as
 * does `now()`.
 */
export function scheduleTrayMetrics(
  measure: () => void,
  measured: { current: boolean },
  schedule: (run: () => void) => () => void = afterNextPaint,
) {
  let pending: (() => void) | null = null;
  const cancel = () => {
    pending?.();
    pending = null;
  };
  const now = () => {
    cancel();
    measured.current = true;
    measure();
  };
  return {
    now,
    resized: () => {
      if (measured.current) now();
      else pending ??= schedule(now);
    },
    cancel,
  };
}
