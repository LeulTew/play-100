import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
          licenseUrl: 'http://example.com/license',
        },
        disclosureLabel: 'Artwork credits',
      }),
    );
    expect(html).toContain('&lt;script&gt;not markup&lt;/script&gt;');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<script>');
  });
});
