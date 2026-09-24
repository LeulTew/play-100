import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('bounded CSS motion policy', () => {
  it('never reinstates a universal off-policy or OS-reduction motion kill', async () => {
    const entryUrl = new URL('../styles.css', import.meta.url);
    const entry = await readFile(entryUrl, 'utf8');
    const imports = [...entry.matchAll(/^@import ['"]([^'"]+)['"];$/gm)];
    const partials = await Promise.all(
      imports.map((match) => {
        const path = match[1];
        if (!path) throw new Error(`Unreadable @import in ${entryUrl.pathname}`);
        return readFile(new URL(path, entryUrl), 'utf8');
      }),
    );
    const css = [entry, ...partials].join('\n');
    expect(css).not.toMatch(/\[data-motion\s*=\s*["']?off["']?\][^{]*\*/);
    const reduced = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^}]+)\}/)?.[1];
    expect(reduced).toBeDefined();
    expect(reduced).not.toMatch(/\*/);
    const targets =
      ':where(button, a, .game-cover img, .game-copy h3 > svg, .dialog-inner, .toast, .magnet > div, .personal-row, .avatar-picker__candidate, .avatar-picker__palette)';
    expect(css).toContain(
      `html[data-motion="off"] ${targets} { animation: none !important; transition: none !important; scroll-behavior: auto !important; }`,
    );
    expect(reduced).toContain(targets);
    expect(reduced).toContain(
      'animation: none !important; transition: none !important; scroll-behavior: auto !important;',
    );
  });
});
