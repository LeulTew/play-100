import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Parser } from 'htmlparser2';
import { describe, expect, it } from 'vitest';
import { GameArtworkCredit } from '../components/games/GameArtwork';
import { artworkFixture } from './discovery-test-fixtures';

describe('contextual artwork-credit disclosure', () => {
  const artwork = {
    ...artworkFixture,
    credit: 'Original artist; resized and converted to WebP. Logos remain trademarks of their owners.',
  };
  it('keeps the complete original credit and both links behind an explicitly labelled native disclosure', () => {
    const html = renderToStaticMarkup(
      createElement(GameArtworkCredit, { artwork, disclosureLabel: 'Artwork credits for a pinned game' }),
    );
    expect(html).toContain('<details class="game-artwork-disclosure">');
    expect(html).toContain('<summary aria-label="Artwork credits for a pinned game">Artwork credits</summary>');
    expect(html).toContain(artwork.credit);
    expect(html).toContain(artwork.sourceUrl);
    expect(html).toContain(artwork.licenseUrl);
    expect(html).toContain(artwork.license);
    expect(html).not.toContain('open=""');
  });
  it('keeps ambiguous credit as complete prose beside labelled source and licence links', () => {
    const html = renderToStaticMarkup(createElement(GameArtworkCredit, { artwork }));
    expect(html).toContain(`<dd class="game-artwork-credit-text">${artwork.credit}</dd>`);
    expect(html).toContain(`<a href="${artwork.sourceUrl}" target="_blank" rel="noopener noreferrer">Source image</a>`);
    expect(html).toContain(`<a href="${artwork.licenseUrl}" target="_blank" rel="noopener noreferrer">`);
    expect(html).toContain('<dt>Licence</dt>');
    expect(html.match(/<a /g)).toHaveLength(2);
  });
  it('does not collapse unrelated surfaces or invent missing attribution', () => {
    expect(renderToStaticMarkup(createElement(GameArtworkCredit, { artwork }))).not.toContain('<details');
    expect(
      renderToStaticMarkup(createElement(GameArtworkCredit, { artwork: null, disclosureLabel: 'Artwork credits' })),
    ).toBe('');
  });
  it('still escapes source text and keeps unsafe credit links inactive', () => {
    const html = renderToStaticMarkup(
      createElement(GameArtworkCredit, {
        artwork: {
          ...artwork,
          credit: '<script>not markup</script>',
          sourceUrl: 'javascript:alert(1)',
          licenseUrl: 'ftp://example.com/license',
        },
        disclosureLabel: 'Artwork credits',
      }),
    );
    expect(html).toContain('&lt;script&gt;not markup&lt;/script&gt;');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<script>');
  });
});

const conversion = 'Resized and converted to WebP; original license retained.';
const trademark = 'Trademark rights are not granted by the copyright license.';
const contributor = 'https://commons.wikimedia.org/wiki/User:VulcanSphere';
const forum = 'http://www.wildfiregames.com/forum/index.php?showtopic=17587&p=274506';
const realStyleCredit =
  `Original: Wildfire Games Vector: VulcanSphere (${contributor}) | ` +
  `Own work based on: ${forum} (${forum}) 0AD | ${conversion} | ${trademark}`;

function creditMarkup(credit: string) {
  const html = renderToStaticMarkup(createElement(GameArtworkCredit, { artwork: { ...artworkFixture, credit } }));
  const links: Record<string, string>[] = [];
  const labels: string[] = [];
  let label: string | null = null;
  let original = '';
  let inOriginal = false;
  new Parser({
    onopentag(name, attributes) {
      if (name === 'a') links.push(attributes);
      if (name === 'dt') label = '';
      if (attributes.class === 'game-artwork-credit-text') inOriginal = true;
    },
    ontext(value) {
      if (label !== null) label += value;
      if (inOriginal) original += value;
    },
    onclosetag(name) {
      if (name === 'dt' && label !== null) {
        labels.push(label);
        label = null;
      }
      if (name === 'p' || name === 'dd') inOriginal = false;
    },
  }).end(html);
  return { html, labels, links, original };
}

describe('conservative artwork-credit presentation', () => {
  it('separates a real 0 A.D.-style credit, links contributor/source and retains the exact supplied text', () => {
    const result = creditMarkup(realStyleCredit);
    expect(result.labels).toEqual([
      'Original art',
      'Vector',
      'Original source',
      'Conversion',
      'Trademark',
      'Image file',
      'Licence',
    ]);
    expect(result.original).toBe(realStyleCredit);
    expect(result.html).toContain('>VulcanSphere</a>');
    expect(result.html).toContain('>www.wildfiregames.com</a>');
    expect(result.html).toContain(conversion);
    expect(result.html).toContain(trademark);
    expect(result.html).toContain(' 0AD');
    expect(result.links.filter((link) => link.href === forum)).toHaveLength(1);
    expect(result.links.filter((link) => link.href === contributor)).toHaveLength(1);
    expect(result.links.every((link) => link.rel === 'noopener noreferrer' && link.target === '_blank')).toBe(true);
    expect(result.html).toContain('<summary>Full supplied credit</summary>');
    expect(result.html).not.toContain('open=""');
  });

  it.each([
    'An unstructured artist and source',
    `Artist | Unlabelled source or additional creator | ${conversion}`,
    `Original: One Vector: Two Vector: Three | ${conversion}`,
    `Original: | ${conversion}`,
    `Artist | | ${conversion}`,
    `Artist | ${conversion} | An extra restriction that must not disappear`,
    `Artist | Source: A | Additional attribution | ${conversion}`,
    `Artist | ${conversion} | ${conversion}`,
    'Artist | Source: archive without a known conversion separator',
  ])('falls back to the complete original when roles or separators are ambiguous: %s', (credit) => {
    const result = creditMarkup(credit);
    expect(result.labels).toEqual(['Art', 'Image file', 'Licence']);
    expect(result.original).toBe(credit);
    expect(result.html).not.toContain('Full supplied credit');
  });

  it('does not deduplicate different URLs or repeated words', () => {
    const other = 'https://example.org/different-source';
    const credit = `Artist Artist | Own work based on: ${forum} (${other}) | ${conversion}`;
    const result = creditMarkup(credit);
    expect(result.original).toBe(credit);
    expect(result.html).toContain('Artist Artist');
    expect(result.links.some((link) => link.href === forum || link.href === other)).toBe(false);
  });

  it('links a single stated source URL without changing its target or the original credit', () => {
    const credit = `Artist | Source: ${forum} | ${conversion}`;
    const result = creditMarkup(credit);
    expect(result.links.filter((link) => link.href === forum)).toHaveLength(1);
    expect(result.original).toBe(credit);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,source',
    'ftp://example.org/source',
    'https://user:password@example.org/source',
    'https://example.org\\@evil.invalid/source',
  ])('leaves unsafe contributor text unlinked and intact: %s', (url) => {
    const credit = `Original: Artist Vector: Contributor (${url}) | ${conversion}`;
    const result = creditMarkup(credit);
    expect(result.links.some((link) => link.href === url)).toBe(false);
    expect(result.original).toBe(credit);
  });
});
