import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { author } from '../lib/author';
import { defaultFilters } from '../lib/url';
import { AuthorLinks } from './AuthorLinks';
import { SiteFooter } from './SiteFooter';
import { AboutDialog } from './AboutDialog';
import { MenuDialog } from './MenuDialog';

const expected = [
  ['github', 'Leul on GitHub (opens in a new tab)', author.githubProfileUrl],
  ['linkedin', 'Leul on LinkedIn (opens in a new tab)', author.linkedinUrl],
  ['telegram', 'Leul on Telegram, @fabbin (opens in a new tab)', author.telegramUrl],
  ['email', `Email Leul at ${author.email}`, `mailto:${author.email}`],
];

describe('shared author contact links', () => {
  it('names and orders four icon links with safe external targets and native email', () => {
    const html = renderToStaticMarkup(createElement(AuthorLinks));
    const links = [...html.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/g)];
    expect(links).toHaveLength(4);
    for (const [index, [icon, name, href]] of expected.entries()) {
      const [, attributes, iconMarkup] = links[index]!;
      expect(attributes).toContain(`href="${href}"`);
      expect(attributes).toContain(`aria-label="${name}"`);
      expect(attributes).toContain('class="icon-button"');
      expect(attributes).toContain('title=');
      expect(iconMarkup).toContain('aria-hidden="true"');
      expect(iconMarkup).toContain('focusable="false"');
      expect(iconMarkup).toContain(`<use href="/icons/author-links.svg#${icon}"></use>`);
      expect(iconMarkup).not.toContain('<path');
      if (icon === 'email') expect(attributes).not.toContain('target=');
      else {
        expect(attributes).toContain('target="_blank"');
        expect(attributes).toContain('rel="noopener noreferrer"');
      }
    }
  });

  it('uses the same author link group in Footer, About and Menu', () => {
    const menu = createElement(MenuDialog, {
      page: 'collection',
      gamesView: 'library',
      filters: defaultFilters,
      onlineAvailable: false,
      creator: false,
      onNavigate: vi.fn(),
      onSettings: vi.fn(),
      onAbout: vi.fn(),
      onClose: vi.fn(),
      captureFocusGuard: () => () => true,
    });
    for (const node of [createElement(SiteFooter), createElement(AboutDialog, { onClose: vi.fn() }), menu]) {
      const html = renderToStaticMarkup(node);
      expect(html).toContain(`Curated by <strong>${author.fullName}</strong>`);
      expect(html.match(/class="author-links"/g)).toHaveLength(1);
      for (const [, name, href] of expected) {
        expect(html).toContain(`aria-label="${name}"`);
        expect(html).toContain(`href="${href}"`);
      }
    }
    const footer = renderToStaticMarkup(createElement(SiteFooter));
    expect(footer).toContain(`href="${author.githubUrl}"`);
    expect(footer).toContain('Source code<svg');
  });

  it('ships only inert, monochrome symbols in the static sprite', () => {
    const sprite = readFileSync(new URL('../../public/icons/author-links.svg', import.meta.url), 'utf8');
    expect([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(([, id]) => id)).toEqual(expected.map(([id]) => id));
    expect(sprite.match(/fill="currentColor"/g)).toHaveLength(4);
    expect(sprite).not.toMatch(/<script|<style|onload=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    const component = readFileSync(new URL('./AuthorLinks.tsx', import.meta.url), 'utf8');
    expect(component).not.toContain('<path');
  });
});
