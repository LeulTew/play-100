import { describe, expect, it } from 'vitest';
import { measureTrayMetrics, TRAY_METRIC_PROPERTIES } from './tray-metrics';
import type { TrayMetricTargets } from './tray-metrics';

/**
 * <html>'s inline style and the chrome, as a browser treats them: a write to a custom property on
 * <html> dirties the style of the whole document, and a later getBoundingClientRect() forces that
 * style recalculation before it can answer.
 */
function page(heights: { header?: number; navigation?: number; toast?: number; tray?: number; trayMarkTop?: number }, initial: Record<string, string> = {}) {
  const inline = new Map(Object.entries(initial));
  const log: string[] = [];
  let dirty = false;
  let forcedRecalcs = 0;
  const box = (name: string, top: number, height: number) => ({
    getBoundingClientRect: () => {
      if (dirty) {
        forcedRecalcs += 1;
        dirty = false;
      }
      log.push(`read ${name}`);
      return { top, bottom: top + height, height };
    },
  });
  const element = (name: 'header' | 'navigation' | 'toast', top: number) => {
    const height = heights[name];
    return height === undefined ? null : box(name, top, height);
  };
  const style: TrayMetricTargets['style'] = {
    getPropertyValue: property => inline.get(property) ?? '',
    setProperty: (property, value) => {
      log.push(`set ${property} ${value}`);
      inline.set(property, value);
      dirty = true;
    },
    removeProperty: property => {
      log.push(`remove ${property}`);
      const value = inline.get(property) ?? '';
      inline.delete(property);
      dirty = true;
      return value;
    },
  };
  const marks = heights.trayMarkTop === undefined ? [] : [box('tray mark', heights.trayMarkTop, 20)];
  const tray = heights.tray === undefined ? null : { ...box('tray', 700, heights.tray), querySelectorAll: () => marks };
  const targets: TrayMetricTargets = { style, header: element('header', 0), navigation: element('navigation', 780), toast: element('toast', 600), tray };
  return {
    targets,
    log,
    values: () => Object.fromEntries(inline),
    forcedRecalcs: () => forcedRecalcs,
    clean: () => { dirty = false; log.length = 0; },
  };
}

describe('compare tray metrics', () => {
  it('reads every height before it writes, so measuring forces no style recalculation', () => {
    const current = page({ header: 72.2, navigation: 66, toast: 47.5, tray: 88.4, trayMarkTop: 690 });
    measureTrayMetrics(current.targets);
    expect(current.forcedRecalcs()).toBe(0);
    expect(current.log).toEqual([
      'read tray', 'read tray mark', 'read header', 'read navigation', 'read toast',
      'set --site-header-height 73px', 'set --mobile-nav-height 66px', 'set --toast-height 48px', 'set --compare-tray-height 99px',
    ]);
    expect(current.values()).toEqual({ '--site-header-height': '73px', '--mobile-nav-height': '66px', '--toast-height': '48px', '--compare-tray-height': '99px' });
  });

  it('writes nothing when nothing moved, so the document keeps its style', () => {
    const current = page({ header: 72, navigation: 66, toast: 48, tray: 88 });
    measureTrayMetrics(current.targets);
    current.clean();
    measureTrayMetrics(current.targets);
    expect(current.log.filter(entry => !entry.startsWith('read '))).toEqual([]);
    expect(current.forcedRecalcs()).toBe(0);
  });

  it('removes the height of a hidden tray or a missing element, and only when it was set', () => {
    const shown = { '--site-header-height': '72px', '--mobile-nav-height': '66px', '--toast-height': '48px', '--compare-tray-height': '88px' };
    const current = page({ header: 72, navigation: 66 }, shown);
    measureTrayMetrics(current.targets);
    expect(current.log.filter(entry => !entry.startsWith('read '))).toEqual(['remove --toast-height', 'remove --compare-tray-height']);
    expect(current.values()).toEqual({ '--site-header-height': '72px', '--mobile-nav-height': '66px' });
    current.clean();
    measureTrayMetrics(current.targets);
    expect(current.log.filter(entry => !entry.startsWith('read '))).toEqual([]);
    expect(TRAY_METRIC_PROPERTIES).toEqual(['--site-header-height', '--mobile-nav-height', '--toast-height', '--compare-tray-height']);
  });

  it('would count the forced recalculations of a measurement that writes between reads', () => {
    // The shape CompareTray's measurement had before: each height written as soon as it was read.
    const interleaved = ({ style, header, navigation, toast }: TrayMetricTargets) => {
      for (const [element, property] of [[header, '--site-header-height'], [navigation, '--mobile-nav-height'], [toast, '--toast-height']] as const) {
        if (element) style.setProperty(property, `${Math.ceil(element.getBoundingClientRect().height)}px`);
      }
    };
    const current = page({ header: 72, navigation: 66, toast: 48 });
    interleaved(current.targets);
    expect(current.forcedRecalcs()).toBe(2);
  });
});
