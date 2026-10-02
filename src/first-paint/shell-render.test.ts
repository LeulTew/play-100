import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootNotice, ROOT_OPEN, shellMarkup } from '../../scripts/first-paint/shell-html';
import { renderShell } from './shell-render';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('the rendered first-paint shell', () => {
  it.each(['offline', 'online'] as const)('renders the %s shell index.html ships', (variant) => {
    const root = shellMarkup(html, variant);
    const shell = root.slice(ROOT_OPEN.length, root.length - bootNotice(root).length - '</div>'.length);
    // React writes boolean attributes with an empty value; HTML parses both spellings the same.
    expect(renderShell(variant)).toBe(shell.replace(/ (hidden|disabled)(?=[ >])/g, ' $1=""'));
  });
});
