import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FriendMoreActions } from './FriendMoreActions';
import { popoverSupported } from './popover-support';

// Stands in for a browser: its elements have the Popover methods or not, and its matches() knows :popover-open or not.
function browserWith({ methods, selector }: { methods: boolean; selector: boolean }) {
  vi.stubGlobal(
    'HTMLElement',
    methods
      ? class {
          showPopover() {}
          hidePopover() {}
        }
      : class {},
  );
  vi.stubGlobal('document', {
    createElement: () => ({
      matches: (query: string) => {
        if (!selector && query.includes(':popover-open')) throw new SyntaxError(`'${query}' is not a valid selector.`);
        return false;
      },
    }),
  });
}

function menuMarkup() {
  return renderToStaticMarkup(
    createElement(FriendMoreActions, { name: 'Ada', accepted: true, disabled: false, onChoose: () => {} }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Popover detection', () => {
  it('needs both Popover methods and the :popover-open selector', () => {
    browserWith({ methods: true, selector: true });
    expect(popoverSupported()).toBe(true);
    browserWith({ methods: false, selector: true });
    expect(popoverSupported()).toBe(false);
    browserWith({ methods: true, selector: false });
    expect(popoverSupported()).toBe(false);
  });

  it('reports no Popover API without a DOM', () => {
    expect(popoverSupported()).toBe(false);
  });
});

describe("a friend row's More actions", () => {
  it('render as a popover menu where the Popover API exists', () => {
    browserWith({ methods: true, selector: true });
    const html = menuMarkup();
    expect(html).toMatch(/<div[^>]* popover="auto"[^>]* role="menu"/);
    expect(html).not.toMatch(/<div[^>]* hidden=""/);
    expect(html).toContain('aria-expanded="false"');
  });

  it.each([
    ['without the Popover methods', { methods: false, selector: true }],
    ['without the :popover-open selector', { methods: true, selector: false }],
  ])('render as a closed disclosure %s', (_label, browser) => {
    browserWith(browser);
    const html = menuMarkup();
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(controls).not.toBe('');
    const id = controls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(html).toMatch(new RegExp(`<div id="${id}" hidden="" role="menu" aria-label="Actions for Ada"`));
    expect(html).not.toContain('popover=');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('>Remove friend</button>');
    expect(html).toContain('>Block player</button>');
  });
});
