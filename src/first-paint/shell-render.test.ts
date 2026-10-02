import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootNotice, ROOT_OPEN, SHELL_PLACEHOLDER, shellMarkup, withShell } from '../../scripts/first-paint/shell-html';
import { renderShell } from './shell-render';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('the rendered first-paint shell', () => {
  it.each(['offline', 'online'] as const)('fills #root of the %s index.html', async (variant) => {
    const shell = renderShell(variant);
    const root = shellMarkup(html, shell);
    // The shell, then index.html's own failure notice, and nothing else.
    expect(root).toBe(`${ROOT_OPEN}${shell}${bootNotice(root)}</div>`);
    const shipped = withShell(html, shell);
    expect(shipped).not.toContain(SHELL_PLACEHOLDER);
    // index.html as the shell step emits it, before the build moves its startup tags and inlines the critical CSS
    // (scripts/first-paint/plugin.ts), so each change to the shell shows in review.
    await expect(shipped).toMatchFileSnapshot(`./__snapshots__/index.${variant}.html`);
  });
});
