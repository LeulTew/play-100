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
      'Guest games, progress, ratings and notes stay in browser storage.',
      'Each account has a separate device copy.',
      'Settings lets you export or import backups and request protection from automatic storage cleanup.',
      'Service limits can pause online saving; errors and conflicts never silently replace device copies.',
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
      'Content-free',
    ])
      expect(privacy).not.toContain(term);
  });

  it('keeps the consent, creator-view and operator-access disclosures unchanged', () => {
    expect(privacy).toContain(
      'Online-saving consent lets the creator view your profile and ranking summary, not notes or Play later.',
    );
    expect(privacy).toContain('Database operators can access stored data.');
    expect(privacy).toContain('Sign-in never uploads guest data automatically; online saving needs separate consent.');
    for (const phrase of [
      'Firebase Authentication and Firestore at no cost.',
      'No analytics scripts, ad trackers, anonymous accounts or remote avatar services are used.',
      'Rankings can include unplayed games; ranking never marks them played or completed.',
      'Publishing shares only the previewed profile and selected ratings, not email, notes or play history.',
      'Community listing needs separate consent.',
      'Link-only rankings are public to anyone with the link.',
      'Clearing site data can erase edits not yet uploaded.',
      'In Account, you can sign out, stop online saving, export or delete data.',
    ])
      expect(privacy).toContain(phrase);
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
    expect(html.match(/<a\b/g)).toHaveLength(10);
    expect(html).toContain('aria-label="Collection author"');
    expect(html).toContain('aria-label="Email Leul at leulman2@gmail.com"');
    expect(html).not.toMatch(/<p>[^<]*<a\b/);
  });

  it('preserves complete catalog and licence attribution prose outside the link rows', () => {
    const paragraphs = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(([, text]) => text!.replace(/\s+/g, ' ').trim());
    expect(paragraphs).toContain(
      'Discover includes a built-in catalog and optional online facts from Wikidata (CC0) and the documented FreeToGame API. FreeToGame data retains credit and source links.',
    );
    expect(paragraphs).toContain(
      'Play 100 uses React, Three.js, dnd kit, IndexedDB and customized React Bits CountUp, Magnet and AnimatedContent. React Bits is copyright 2026 David Haz, used under MIT + Commons Clause. Barlow Condensed and Hanken Grotesk use the SIL Open Font License. Creature avatars are generated locally with DiceBear Critters (CC0 1.0) and DiceBear core (MIT); no Google photo is fetched.',
    );
  });

  it('matches the About label and uses straight quotes and en-dash ranges', () => {
    expect(html).toContain('>About &amp; credits</h2>');
    expect(html).toContain('>Leul&#x27;s ratings</h3>');
    expect(html).not.toContain('Supabase');
    expect(html).toContain('ranks 1–50;');
    expect(html).toContain('ranks 51–100.');
    expect(html).not.toMatch(/[“”‘’]/);
  });

  it('distinguishes the displayed sort order from original ranks in complete sentences', () => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'");
    expect(text).toContain('Sorting changes only the order shown; each game keeps its original rank.');
    expect(text).toContain("For example, The Witcher 3's original rating is 9.9, and Grand Theft Auto IV's is 9.8.");
    expect(text).toContain('Metacritic and PC Gamer use 100-point scales; IGN and GameSpot use 10.');
    expect(text).toContain("You don't need an account or API key.");
    expect(text).not.toMatch(/Sorting preserves|Scales:|Enhanced download:|Content-free|\w\s*\/\s*\w/);
  });
});
