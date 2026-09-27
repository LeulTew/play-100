import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutDialog } from './AboutDialog';

const html = renderToStaticMarkup(createElement(AboutDialog, { onClose: () => {} }));
const privacy = (/<h3>Data &amp; privacy<\/h3>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&');

describe('About data and privacy summary', () => {
  it('uses the same plain storage, limit and deletion wording as the data-use page', () => {
    for (const phrase of [
      "Guest games, progress, ratings and notes stay in this browser's storage.",
      'Each account has its own copy on this device.',
      'Settings supports backup export/import and protection from automatic storage cleanup.',
      "The online service's usage limits can pause online saving; errors and conflicts do not silently replace a local copy.",
      "Small records with no library content remain so that old sessions can't bring deleted data back.",
    ])
      expect(privacy).toContain(phrase);
    for (const term of [
      'IndexedDB',
      'eviction',
      'local cache',
      'Free cloud quotas',
      'revocation markers',
      'stale tabs',
    ])
      expect(privacy).not.toContain(term);
  });

  it('keeps the consent, creator-view and operator-access disclosures unchanged', () => {
    expect(privacy).toContain(
      'Before online saving, you agree that the creator can view your account profile and ranking summary.',
    );
    expect(privacy).toContain('a database operator can technically access stored data.');
    expect(privacy).toContain(
      'Signing in does not automatically upload the guest library; online saving requires a separate choice and consent.',
    );
  });
});

describe('About source reference rows', () => {
  it('uses the existing wrapping rows and full-height links without changing destinations or names', () => {
    const groups = [...html.matchAll(/<div class="button-row" role="group" aria-label="([^"]+)">([\s\S]*?)<\/div>/g)];
    expect(groups.map((match) => match[1])).toEqual(['Public catalog sources', 'Project sources and notices']);
    const links = groups.flatMap((match) => [...match[2]!.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/g)]);
    expect(links).toHaveLength(6);
    const expected = [
      ['Wikidata (CC0)', 'https://www.wikidata.org/wiki/Wikidata:Data_access'],
      ['FreeToGame API', 'https://www.freetogame.com/api-doc'],
      ['FreeToGame', 'https://www.freetogame.com/'],
      ['React Bits', 'https://reactbits.dev'],
      ['Creature avatar notices', '/licenses/dicebear.txt'],
      ['Read third-party notices', '/credits.txt'],
    ];
    for (const [index, link] of links.entries()) {
      expect(link[1]).toContain('class="text-button"');
      expect(link[1]).toContain(`href="${expected[index]![1]}"`);
      expect(link[1]).toContain('target="_blank"');
      expect(link[1]).toContain('rel="noreferrer"');
      expect(link[2]!.replace(/<svg\b[\s\S]*?<\/svg>/g, '').trim()).toBe(expected[index]![0]);
    }
    expect(html.match(/<a\b/g)).toHaveLength(6);
    expect(html).not.toMatch(/<p>[^<]*<a\b/);
  });

  it('preserves complete catalog and licence attribution prose outside the link rows', () => {
    const paragraphs = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(([, text]) => text!.replace(/\s+/g, ' ').trim());
    expect(paragraphs).toContain(
      'Discover includes a bundled catalog and optional online metadata lookup from Wikidata (CC0) and the documented FreeToGame API. Game data from FreeToGame is attributed and linked to its source.',
    );
    expect(paragraphs).toContain(
      'Built with React, Three.js, dnd kit, native IndexedDB and customized React Bits CountUp, Magnet and AnimatedContent. React Bits copyright 2026 David Haz, used under its MIT + Commons Clause license. Typography: Barlow Condensed and Hanken Grotesk, under the SIL Open Font License. Creature avatars use locally generated DiceBear Critters (CC0 1.0) with DiceBear core (MIT); no Google photo is fetched.',
    );
  });
});
