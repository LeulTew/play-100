import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const credits = readFileSync(new URL('../public/credits.txt', import.meta.url), 'utf8');

describe('bundled transitive dependency notices', () => {
  it.each([
    ['idb', 'idb.txt'],
    ['@dnd-kit/accessibility', 'dnd-kit-accessibility.txt'],
  ])('publishes the exact installed %s license and links it from the credits', (dependency, notice) => {
    const installed = readFileSync(new URL(`../node_modules/${dependency}/LICENSE`, import.meta.url));
    const published = readFileSync(new URL(`../public/licenses/${notice}`, import.meta.url));
    expect(published).toEqual(installed);
    expect(credits).toContain(`/licenses/${notice}`);
  });
});
