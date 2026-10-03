import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CompletedToggle } from './CompletedToggle';

describe('CompletedToggle save focus', () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] as const)('keeps the button focusable and guards activation with busy=%s, completed=%s', (busy, completed) => {
    const onChange = vi.fn();
    const props = { title: 'Game', completed, busy, onChange };
    const html = renderToStaticMarkup(createElement(CompletedToggle, props));
    expect(html).toContain(`aria-pressed="${completed}"`);
    expect(html).toContain('aria-label="Completed: Game"');
    expect(html.includes('aria-disabled="true"')).toBe(busy);
    expect(html).not.toContain('disabled=""');
    const rendered: { button?: ReactElement<{ onClick: () => void }> } = {};
    renderToStaticMarkup(
      createElement(function Probe() {
        rendered.button = CompletedToggle(props);
        return rendered.button;
      }),
    );
    rendered.button?.props.onClick();
    expect(rendered.button).toBeDefined();
    if (busy) expect(onChange).not.toHaveBeenCalled();
    else expect(onChange).toHaveBeenCalledExactlyOnceWith(!completed);
  });
});
