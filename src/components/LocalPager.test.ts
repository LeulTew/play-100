import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LocalPager } from './LocalPager';

describe('LocalPager availability', () => {
  it.each([0, 1, 25])('omits inactive navigation for %i results', (total) => {
    expect(
      renderToStaticMarkup(
        createElement(LocalPager, {
          total,
          pageSize: 25,
          offset: 475,
          onOffsetChange: vi.fn(),
        }),
      ),
    ).toBe('');
  });

  it('keeps the full navigation and truthful clamped range for multiple pages', () => {
    const onOffsetChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(LocalPager, {
        total: 26,
        pageSize: 25,
        offset: 475,
        onOffsetChange,
        label: 'Library pages',
        itemLabel: 'matching game',
      }),
    );
    expect(html).toContain('aria-label="Library pages"');
    expect(html).toContain('26–26 of 26 matching games');
    expect(html).toContain('<option value="2" selected="">2 of 2</option>');
    expect(html).toContain('disabled="">Next</button>');
    expect(html).toContain('disabled="">Last</button>');
    expect(onOffsetChange).not.toHaveBeenCalled();
  });
});
