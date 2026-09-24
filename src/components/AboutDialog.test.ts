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
