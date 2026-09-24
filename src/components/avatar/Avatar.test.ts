import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AvatarDescriptor } from '../../lib/avatar';
import { Avatar } from './Avatar';

const descriptor: AvatarDescriptor = { version: 1, seed: '0'.repeat(32), palette: 'lime' };

describe('Avatar image boundary', () => {
  it('defaults to a dimensioned decorative 48px image without inline SVG', () => {
    const markup = renderToStaticMarkup(createElement(Avatar, { descriptor }));
    expect(markup).toContain('width="48" height="48"');
    expect(markup).toContain('alt=""');
    expect(markup).toContain('src="data:image/svg+xml;charset=utf-8,');
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('<link');
  });

  it.each([32, 48, 96])('reserves %ipx dimensions with an escaped accessible label', (size) => {
    const markup = renderToStaticMarkup(
      createElement(Avatar, { descriptor, size, className: 'profile-avatar', label: 'Sam <player> avatar' }),
    );
    expect(markup).toContain(`width="${size}" height="${size}"`);
    expect(markup).toContain('class="avatar profile-avatar"');
    expect(markup).toContain('alt="Sam &lt;player&gt; avatar"');
  });

  it.each([0, -1, 1.5, NaN, Infinity, 4097])('rejects invalid dimensions %s', (size) => {
    expect(() => renderToStaticMarkup(createElement(Avatar, { descriptor, size }))).toThrow(RangeError);
  });

  it('does not turn invalid metadata into a different face', () => {
    expect(() => renderToStaticMarkup(createElement(Avatar, { descriptor: { ...descriptor, seed: 'bad' } }))).toThrow(
      TypeError,
    );
  });
});
