import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RouteFallback } from './RouteFallback';

describe('destination loading anatomy', () => {
  it.each([
    ['collection', 'The 100'], ['games', 'My games'], ['library', 'My games'], ['rankings', 'My games'],
    ['discover', 'Discover'], ['account', 'Account'], ['publish', 'Publish ranking'], ['community', 'Community'],
    ['profile', 'Public ranking'], ['creator', 'Creator desk'], ['friends', 'Friends'], ['friend', 'Player'],
    ['invite', 'Invitation'], ['compare', 'Compare rankings'], ['friend-sharing', 'Friends sharing'], ['friend-shelf', 'Shared games'],
  ] as const)('names %s without inventing loaded contents', (route, title) => {
    const html = renderToStaticMarkup(createElement(RouteFallback, { route, kind: 'public-page' }));
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).toContain(`Loading ${title}...`);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-hidden="true" inert=""');
    expect(html).not.toMatch(/my-games-workspace|library-results-boundary|id="(my-games-title|discover-title)"/);
    expect(html).not.toMatch(/<(button|input|form|img)\b/);
    expect(html).not.toContain('0 games');
  });

  it('keeps sign-in as a static native form skeleton even when opened from Discover', () => {
    const onClose = vi.fn();
    const getReturnFocus = vi.fn(() => null);
    const html = renderToStaticMarkup(createElement(RouteFallback, { route: 'discover', kind: 'account-sheet', onClose, getReturnFocus }));
    expect(html).toContain('aria-labelledby="loading-account-title"');
    expect(html).toContain('data-motion-owned="true"');
    expect(html).toContain('data-autofocus="true" tabindex="-1">Sign in</h2>');
    expect(html).toContain('route-form');
    expect(html).not.toContain('route-cards');
    expect(html).not.toMatch(/<(input|form)\b/);
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(getReturnFocus).not.toHaveBeenCalled();
  });

  it('does not pull lazy route code, effects or decorative animations into the fallback', () => {
    const source = readFileSync(new URL('./RouteFallback.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('./route-fallback.css', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\b(lazy|fetch|useEffect|useState|setTimeout)\s*\(|\bimport\s*\(/);
    expect(source).not.toMatch(/from\s+['"][^'"]*(cloud\/|personal\/|catalog\/)/);
    expect(css).not.toMatch(/@import|@keyframes|\banimation\s*:|\btransition\s*:|gradient\s*\(/);
  });
});
