import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryCard } from '../components/catalog/DiscoveryCard';
import { emptyPersonalLibrary } from './personal-library';
import { artworkFixture, discoveryFixture } from './discovery-test-fixtures';

describe('compact catalog card markup', () => {
  it.each([
    [56, true],
    [159, true],
    [160, false],
    [360, false],
  ] as const)('uses a pre-sized wordmark plate only above a 3:1 aspect ratio (480 x %i)', (height, wordmark) => {
    const html = renderToStaticMarkup(
      createElement(DiscoveryCard, {
        record: discoveryFixture.record,
        artwork: { ...artworkFixture, width: 480, height },
        state: emptyPersonalLibrary(),
        busy: false,
        onAction: vi.fn(),
        onPin: vi.fn(),
      }),
    );
    expect(html.includes('data-wordmark=""')).toBe(wordmark);
    expect(html.includes(`<strong aria-hidden="true">${discoveryFixture.record.title}</strong>`)).toBe(wordmark);
    expect(html).toContain(`width="480" height="${height}"`);
    expect(html).toContain(artworkFixture.src);
    expect(html).toContain(artworkFixture.credit);
    expect(html).toContain(artworkFixture.sourceUrl);
    expect(html).toContain(artworkFixture.licenseUrl);
    expect(html).toContain('Add to My games: Kingdom Come: Deliverance');
    expect(html).toContain('Pin for comparison: Kingdom Come: Deliverance');
  });

  it('renders intrinsic image dimensions, lazy decoding, visible actions and active attribution', () => {
    const onAction = vi.fn();
    const onPin = vi.fn();
    const html = renderToStaticMarkup(
      createElement(DiscoveryCard, {
        record: discoveryFixture.record,
        artwork: artworkFixture,
        state: emptyPersonalLibrary(),
        busy: false,
        onAction,
        onPin,
      }),
    );
    expect(html).toContain('width="320" height="180"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('Add to My games: Kingdom Come: Deliverance');
    expect(html).toContain('Pin for comparison: Kingdom Come: Deliverance');
    expect(html).toContain('Actions &amp; source');
    expect(html).toContain(artworkFixture.sourceUrl);
    expect(html).toContain(artworkFixture.licenseUrl);
    expect(html).toContain(discoveryFixture.record.sourceUrl);
    expect(html).toContain('<p class="discovery-card-meta">2018 · Role-playing</p>');
    expect(html).toContain('<strong>Source classification:</strong> RPG');
    expect(html).toContain('Play later');
    expect(html).toContain('Add to ranking');
    expect(onAction).not.toHaveBeenCalled();
    expect(onPin).not.toHaveBeenCalled();
  });
  it('uses an honest no-art state and permits pinning while private storage is busy', () => {
    const html = renderToStaticMarkup(
      createElement(DiscoveryCard, {
        record: discoveryFixture.record,
        state: emptyPersonalLibrary(),
        busy: true,
        onAction: vi.fn(),
        onPin: vi.fn(),
      }),
    );
    expect(html).toContain('Artwork unavailable');
    expect(html).not.toContain('<img');
    expect(html).toContain('aria-label="Pin for comparison: Kingdom Come: Deliverance"');
    const pin = html
      .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
      ?.find((button) => button.includes('aria-label="Pin for comparison: Kingdom Come: Deliverance"'));
    expect(pin).toBeDefined();
    expect(pin).not.toContain('disabled=""');
    expect(pin).not.toContain('aria-disabled="true"');
  });
  it('does not copy source HTML credit into markup', () => {
    const html = renderToStaticMarkup(
      createElement(DiscoveryCard, {
        record: discoveryFixture.record,
        artwork: { ...artworkFixture, credit: '<script>unsafe</script>' },
        state: emptyPersonalLibrary(),
        busy: false,
        onAction: vi.fn(),
        eager: true,
      }),
    );
    expect(html).toContain('loading="eager"');
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
  it('renders one optional drag handle beside Pin, never nested inside an interactive control', () => {
    const renderDragHandle = vi.fn(() =>
      createElement('button', { type: 'button', 'data-drag-handle': true }, 'Drag to compare'),
    );
    const html = renderToStaticMarkup(
      createElement(DiscoveryCard, {
        record: discoveryFixture.record,
        state: emptyPersonalLibrary(),
        busy: false,
        onAction: vi.fn(),
        onPin: vi.fn(),
        renderDragHandle,
      }),
    );
    expect(renderDragHandle).toHaveBeenCalledExactlyOnceWith(discoveryFixture.record);
    expect(html).toContain('Pin</button><button type="button" data-drag-handle="true">Drag to compare</button></div>');
    expect(html.match(/data-drag-handle/g)).toHaveLength(1);
  });
});
