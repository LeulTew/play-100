import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Edges {
  left: number;
  right: number;
}

interface NavigationItem extends Edges {
  label: string;
  width: number;
  height: number;
  letterSpacing: string;
  /** The label element's box, and the box of each line its text is drawn on. */
  labelBox: Edges;
  lines: Edges[];
}

export interface NavigationColumns {
  /** The bar's content box, inside its padding. */
  content: Edges;
  items: NavigationItem[];
}

/** The columns of the mobile navigation, and where each label and each of its lines are drawn. */
export async function readNavigationColumns(page: Page, selector = '.mobile-nav'): Promise<NavigationColumns> {
  return page.locator(selector).evaluate((nav) => {
    const edges = (rect: DOMRect) => ({ left: rect.left, right: rect.right });
    const bar = nav.getBoundingClientRect();
    const style = getComputedStyle(nav);
    return {
      content: {
        left: bar.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
        right: bar.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
      },
      items: [...nav.children].map((item) => {
        const label = item.querySelector('span')!;
        const text = document.createRange();
        text.selectNodeContents(label);
        const box = item.getBoundingClientRect();
        return {
          ...edges(box),
          label: label.textContent ?? '',
          width: box.width,
          height: box.height,
          letterSpacing: getComputedStyle(label).letterSpacing,
          labelBox: edges(label.getBoundingClientRect()),
          lines: [...text.getClientRects()].filter((line) => line.width > 0).map(edges),
        };
      }),
    };
  });
}

/**
 * G6-QA A11Y-001: five equal columns that fill the bar, each a target of at least 48px, and every label inside its own
 * column with each of its lines centred there, however the label wraps.
 */
export function expectEqualColumns({ content, items }: NavigationColumns, when: string): void {
  expect(items, `${when}: five destinations`).toHaveLength(5);
  const widths = items.map((item) => item.width);
  const spread = Math.max(...widths) - Math.min(...widths);
  expect(spread, `${when}: equal columns (${widths.join(', ')})`).toBeLessThanOrEqual(0.1);
  const starts = [content.left, ...items.slice(0, -1).map((item) => item.right)];
  for (const [index, item] of items.entries()) {
    const name = `${when}: ${item.label}`;
    expect(Math.abs(item.left - starts[index]!), `${name} leaves no gap before it`).toBeLessThanOrEqual(0.1);
    expect(Math.min(item.width, item.height), `${name} is a 48px target`).toBeGreaterThanOrEqual(48);
    expect(item.lines.length, `${name} is drawn`).toBeGreaterThan(0);
    for (const box of [item.labelBox, ...item.lines]) {
      expect(box.left, `${name} stays in its column`).toBeGreaterThanOrEqual(item.left - 0.01);
      expect(box.right, `${name} stays in its column`).toBeLessThanOrEqual(item.right + 0.01);
    }
    const middle = (item.left + item.right) / 2;
    for (const line of item.lines) {
      const offset = Math.abs((line.left + line.right) / 2 - middle);
      expect(offset, `${name}: each line is centred`).toBeLessThanOrEqual(1);
    }
  }
  const end = Math.abs(items.at(-1)!.right - content.right);
  expect(end, `${when}: the columns fill the bar`).toBeLessThanOrEqual(0.1);
}
