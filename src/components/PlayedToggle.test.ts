import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayedToggle } from './PlayedToggle';

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
});
