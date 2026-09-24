import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const textSpacingCSS = `
  * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }
  p { margin-bottom: 2em !important; }
`;

export async function expectReadableSurface(page: Page, surface: string, checkClipping = false) {
  await page.evaluate(() => document.fonts.ready);
  const report = await page.evaluate(
    ({ checkClipping }) => {
      const label = (element: Element) => {
        const parts: string[] = [];
        for (let current: Element | null = element; current && parts.length < 4; current = current.parentElement) {
          if (current.id) {
            parts.unshift(`#${CSS.escape(current.id)}`);
            break;
          }
          parts.unshift(
            current.tagName.toLowerCase() +
              Array.from(current.classList)
                .map((name) => `.${CSS.escape(name)}`)
                .join(''),
          );
        }
        return parts.join(' > ');
      };
      const visible = (element: Element) => {
        if (element.closest('script, style, noscript, template, [hidden], [inert], dialog:not([open]), .sr-only'))
          return false;
        for (let current: Element | null = element; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          if (style.clip !== 'auto' || style.clipPath === 'inset(50%)') return false;
        }
        return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      };
      const small: { selector: string; text: string; size: number; minimum: number }[] = [];
      const clipped: { selector: string; text: string; container: string }[] = [];
      const checkSize = (element: Element, text: string) => {
        const size = parseFloat(getComputedStyle(element).fontSize);
        const minimum = element.closest('[aria-hidden="true"]') ? 11 : 12;
        if (size < minimum) small.push({ selector: label(element), text: text.trim().slice(0, 140), size, minimum });
      };
      const root = document.querySelector('dialog[open]') ?? document.body;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let checkedTextNodes = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const element = node.parentElement;
        if (!element || !node.textContent?.trim() || !visible(element)) continue;
        checkedTextNodes += 1;
        checkSize(element, node.textContent);
        if (!checkClipping || element.closest('[aria-hidden="true"], svg, option')) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects()).filter((rect) => rect.width && rect.height);
        for (
          let ancestor: Element | null = element;
          ancestor && ancestor !== root.parentElement;
          ancestor = ancestor.parentElement
        ) {
          const style = getComputedStyle(ancestor);
          if (['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflowY)) break;
          const paintContainment = /\b(paint|strict|content)\b/.test(style.contain);
          const clipsX = ['hidden', 'clip'].includes(style.overflowX) || paintContainment;
          const clipsY = ['hidden', 'clip'].includes(style.overflowY) || paintContainment;
          if (!clipsX && !clipsY) continue;
          const bounds = ancestor.getBoundingClientRect();
          if (
            rects.some(
              (rect) =>
                (clipsX && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) ||
                (clipsY && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)),
            )
          ) {
            clipped.push({
              selector: label(element),
              text: node.textContent.trim().slice(0, 140),
              container: label(ancestor),
            });
            break;
          }
        }
      }
      for (const element of root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea',
      )) {
        if (visible(element))
          checkSize(
            element,
            element.value ||
              element.getAttribute('placeholder') ||
              element.getAttribute('aria-label') ||
              element.tagName,
          );
      }
      const targets: { selector: string; text: string; width: number; height: number; minimum: number }[] = [];
      for (const element of root.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([type="hidden"]), select, textarea, summary',
      )) {
        if (!visible(element) || element.closest('[aria-hidden="true"]')) continue;
        // Inline prose links have the WCAG target-size exception; standalone links do not.
        if (element.matches('a') && getComputedStyle(element).display === 'inline' && element.closest('p')) continue;
        const target =
          element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)
            ? (Array.from(element.labels ?? []).find(visible) ?? element)
            : element;
        const bounds = target.getBoundingClientRect();
        const minimum = element.matches('.icon-button, .button, .mobile-nav > *') ? 44 : 24;
        if (bounds.width < minimum - 0.5 || bounds.height < minimum - 0.5) {
          targets.push({
            selector: label(element),
            text: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 100) ?? '',
            width: bounds.width,
            height: bounds.height,
            minimum,
          });
        }
      }
      const overflow = Array.from(root.querySelectorAll<HTMLElement>('*'))
        .filter((element) => visible(element) && !element.closest('.ratings-scroll'))
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.right > innerWidth + 1 || bounds.left < -1;
        })
        .slice(0, 15)
        .map(label);
      const horizontalScroll = [root, ...root.querySelectorAll('*')]
        .filter((element) => {
          if (!visible(element) || element.closest('.ratings-scroll') || element.matches('input, select, textarea'))
            return false;
          return (
            ['auto', 'scroll'].includes(getComputedStyle(element).overflowX) &&
            element.scrollWidth > element.clientWidth + 1
          );
        })
        .map(label);
      return {
        checkedTextNodes,
        small,
        clipped,
        targets,
        horizontalScroll,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        overflow,
      };
    },
    { checkClipping },
  );
  expect(report.checkedTextNodes, `${surface}: guard must inspect actual rendered text`).toBeGreaterThan(0);
  expect.soft(report.small, `${surface}: undersized text\n${JSON.stringify(report.small, null, 2)}`).toEqual([]);
  expect
    .soft(report.documentWidth, `${surface}: document overflow ${JSON.stringify(report.overflow)}`)
    .toBeLessThanOrEqual(report.viewportWidth);
  expect.soft(report.horizontalScroll, `${surface}: non-table horizontal scroll regions`).toEqual([]);
  expect
    .soft(report.targets, `${surface}: undersized effective targets\n${JSON.stringify(report.targets, null, 2)}`)
    .toEqual([]);
  if (checkClipping)
    expect.soft(report.clipped, `${surface}: clipped text\n${JSON.stringify(report.clipped, null, 2)}`).toEqual([]);
}

export async function openMenu(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toBeVisible();
}

export async function closeDialog(page: Page) {
  await page.locator('dialog[open]').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}
