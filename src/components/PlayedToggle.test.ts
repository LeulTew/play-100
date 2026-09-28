import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryModeContext } from '../lib/library-mode';
import { PlayedToggle } from './PlayedToggle';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState) };
});

afterEach(() => vi.mocked(useState).mockReset());

const render = (busy: boolean) =>
  renderToStaticMarkup(
    createElement(PlayedToggle, { id: 'g', title: 'Game', played: true, busy, compact: true, onChange: () => {} }),
  );

describe('PlayedToggle', () => {
  it('marks a pending save unavailable without disabling, so the focused checkbox keeps focus', () => {
    const pending = render(true);
    expect(pending).toContain('aria-label="Played: Game"');
    expect(pending).toContain('aria-disabled="true"');
    expect(pending).not.toContain('disabled=""');
    expect(render(false)).not.toContain('disabled');
  });

  it.each([
    ['guest', 'one', true, true, true],
    ['guest', 'two', true, true, false],
    ['account:demo-play100:other', 'one', true, true, false],
    ['guest', 'one', false, true, false],
    ['guest', 'one', true, false, false],
  ] as const)(
    'qualifies an open review against %s/%s, played=%s, completed=%s',
    (scope, id, played, completed, open) => {
      const update = vi.fn();
      vi.mocked(useState).mockReturnValueOnce([{ key: 'guest:one', eligible: true, open: true }, update]);
      const onChange = vi.fn();
      const html = renderToStaticMarkup(
        createElement(
          LibraryModeContext.Provider,
          { value: { scope, onlineEnabled: false, label: 'Fixture' } },
          createElement(PlayedToggle, { id, title: 'Game', played, completed, onChange }),
        ),
      );
      expect(html.includes('<dialog')).toBe(open);
      if (open) expect(update).not.toHaveBeenCalled();
      else
        expect(update).toHaveBeenCalledExactlyOnceWith({
          key: `${scope}:${id}`,
          eligible: played && completed,
          open: false,
        });
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('does not show a new confirmation when completion returns after its review was cleared', () => {
    vi.mocked(useState).mockReturnValueOnce([{ key: 'guest:one', eligible: false, open: false }, vi.fn()]);
    const html = renderToStaticMarkup(
      createElement(PlayedToggle, { id: 'one', title: 'Game', played: true, completed: true, onChange: vi.fn() }),
    );
    expect(html).not.toContain('<dialog');
  });
});
