import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersonalRatingInput } from './PersonalRatingInput';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState) };
});

afterEach(() => vi.mocked(useState).mockReset());

describe('committed and draft rating display', () => {
  it('keeps a saving field focusable and read-only instead of disabling it', () => {
    const html = renderToStaticMarkup(
      createElement(PersonalRatingInput, { title: 'Game', value: 7, busy: true, onCommit: vi.fn() }),
    );
    expect(html).toContain('readOnly=""');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain(' disabled=');
  });

  it.each([null, 0, 7.75])('renders the current clean rating %s without an effect-driven draft reset', (value) => {
    const resetDraft = vi.fn();
    vi.mocked(useState).mockReturnValueOnce(['9.9', resetDraft]);
    const onCommit = vi.fn();
    const html = renderToStaticMarkup(
      createElement(PersonalRatingInput, { title: 'Game', value, busy: false, onCommit }),
    );
    expect(html).toContain(`value="${value === null ? '' : value}"`);
    expect(resetDraft).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps the actual edited draft when a different committed value arrives', () => {
    vi.mocked(useState).mockReturnValueOnce(['4.25', vi.fn()]).mockReturnValueOnce([true, vi.fn()]);
    const onCommit = vi.fn();
    const html = renderToStaticMarkup(
      createElement(PersonalRatingInput, { title: 'Game', value: 8.5, busy: false, onCommit }),
    );
    expect(html).toContain('value="4.25"');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
