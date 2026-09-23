import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryCard } from '../components/catalog/DiscoveryCard';
import { emptyPersonalLibrary } from './personal-library';
import { artworkFixture, discoveryFixture } from './discovery-test-fixtures';

describe('compact catalog card markup', () => {
  it('renders intrinsic image dimensions, lazy decoding, visible actions and active attribution', () => {
    const onAction = vi.fn();
    const onPin = vi.fn();
    const html = renderToStaticMarkup(createElement(DiscoveryCard, { record: discoveryFixture.record, artwork: artworkFixture, state: emptyPersonalLibrary(), busy: false, onAction, onPin }));
    expect(html).toContain('width="320" height="180"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('Add to My games: Kingdom Come: Deliverance');
    expect(html).toContain('Pin Kingdom Come: Deliverance for comparison');
    expect(html).toContain('Actions &amp; source');
    expect(html).toContain(artworkFixture.sourceUrl);
    expect(html).toContain(artworkFixture.licenseUrl);
    expect(html).toContain(discoveryFixture.record.sourceUrl);
    expect(html).toContain('Play later');
    expect(html).toContain('Add to ranking');
    expect(onAction).not.toHaveBeenCalled();
    expect(onPin).not.toHaveBeenCalled();
  });
  it('uses an honest no-art state and permits pinning while private storage is busy', () => {
    const html = renderToStaticMarkup(createElement(DiscoveryCard, { record: discoveryFixture.record, state: emptyPersonalLibrary(), busy: true, onAction: vi.fn(), onPin: vi.fn() }));
    expect(html).toContain('Artwork unavailable');
    expect(html).not.toContain('<img');
    expect(html).toMatch(/aria-label="Pin Kingdom Come: Deliverance for comparison" aria-pressed="false"/);
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Pin/);
  });
  it('does not copy source HTML credit into markup', () => {
    const html = renderToStaticMarkup(createElement(DiscoveryCard, { record: discoveryFixture.record, artwork: { ...artworkFixture, credit: '<script>unsafe</script>' }, state: emptyPersonalLibrary(), busy: false, onAction: vi.fn(), eager: true }));
    expect(html).toContain('loading="eager"');
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
  it('renders one optional drag handle beside Pin, never nested inside an interactive control', () => {
    const renderDragHandle = vi.fn(() => createElement('button', { type: 'button', 'data-drag-handle': true }, 'Drag to compare'));
    const html = renderToStaticMarkup(createElement(DiscoveryCard, {
      record: discoveryFixture.record, state: emptyPersonalLibrary(), busy: false,
      onAction: vi.fn(), onPin: vi.fn(), renderDragHandle,
    }));
    expect(renderDragHandle).toHaveBeenCalledExactlyOnceWith(discoveryFixture.record);
    expect(html).toContain('Pin</button><button type="button" data-drag-handle="true">Drag to compare</button></div>');
    expect(html.match(/data-drag-handle/g)).toHaveLength(1);
  });
});
