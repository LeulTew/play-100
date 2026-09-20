import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MenuDialog } from './MenuDialog';
import { defaultFilters } from '../lib/url';
import type { AppPage } from '../lib/types';
import type { MyGamesTab } from '../lib/my-games-navigation';

function render(onlineAvailable: boolean, creator: boolean, page: AppPage = 'collection', gamesView: MyGamesTab = 'library') {
  return renderToStaticMarkup(createElement(MenuDialog, {
    page, gamesView, filters: defaultFilters, onlineAvailable, creator,
    onNavigate: vi.fn(), onSettings: vi.fn(), onAbout: vi.fn(), onClose: vi.fn(),
  }));
}

describe('Menu visibility and location contract', () => {
  it('does not invent online destinations when configuration is unavailable', () => {
    const html = render(false, true);
    for (const path of ['/account', '/friends', '/community', '/compare', '/publish', '/creator']) {
      expect(html).not.toContain(`href="${path}"`);
    }
    expect(html).toContain('Settings &amp; backups');
    expect(html).toContain('href="/data-use" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('href="/downloads/Play-100-Collection.xlsx" download=""');
    expect(html).toContain('href="/downloads/AAA_games_u_have_to_play_list_top_100.xlsx" download=""');
  });

  it('uses only the supplied authoritative creator result, never a guest or unknown-role guess', () => {
    expect(render(true, false)).not.toContain('Creator desk');
    expect(render(true, true)).toContain('href="/creator"');
    expect(render(true, false)).toContain('href="/account"');
  });

  it.each([
    ['games', 'library', '/my-games'],
    ['library', 'queue', '/my-games?tab=queue'],
    ['rankings', 'ranking', '/my-games?tab=ranking'],
    ['compare', 'library', '/compare'],
  ] as const)('marks the exact current destination for %s/%s', (page, view, href) => {
    const html = render(true, false, page, view);
    expect(html).toContain(`href="${href}" aria-current="page"`);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain('href="/my-library"');
    expect(html).not.toContain('href="/my-rankings"');
  });

  it('leaves contextual person/profile/invite pages out rather than inventing an identity', () => {
    for (const page of ['friend', 'profile', 'invite'] as const) {
      const html = render(true, false, page);
      expect(html).not.toContain('aria-current="page"');
      expect(html).not.toContain('href="/invite"');
      expect(html).not.toContain('href="/u/');
      expect(html).not.toContain('role="menu"');
      expect(html).toContain('aria-label="All navigation"');
    }
  });
});
