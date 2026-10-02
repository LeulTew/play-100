import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectInventory, extractCopy, extractHtmlCopy, renderInventory } from './copy-inventory';

describe('source copy inventory', () => {
  it('keeps the checked-in inventory current with production copy and source references', () => {
    const root = new URL('../', import.meta.url);
    const { entries, fileCount } = collectInventory(fileURLToPath(root));
    const committed = readFileSync(new URL('docs/copy-inventory.md', root), 'utf8');
    expect(
      renderInventory(entries, fileCount) === committed,
      'Copy inventory is stale. Run npx tsx scripts/copy-inventory.ts and commit docs/copy-inventory.md.',
    ).toBe(true);
  });

  it('records conditions, complete interpolation and live-region expressions', () => {
    const entries = extractCopy(
      'src/Example.tsx',
      `
export function Example({ busy, message, title }) {
  if (busy) notify('Saving your changes…');
  return <p role="status">{busy ? 'Saving…' : message}<strong>{title}</strong></p>;
}`,
    );
    expect(
      entries.some((entry) => entry.text.includes('Saving your changes…') && entry.condition.includes('busy is true')),
    ).toBe(true);
    expect(entries.some((entry) => entry.kind === 'Live region' && entry.text.includes('message'))).toBe(true);
    expect(entries.every((entry) => entry.line > 0 && entry.file === 'src/Example.tsx')).toBe(true);
  });
  it('excludes imports, console-only diagnostics and machine attributes', () => {
    const entries = extractCopy(
      'src/Example.tsx',
      `
import thing from 'internal package';
console.error('The controller failed.');
export const Example = () => <button className="button outline" aria-label="Try again">Try again</button>;
`,
    );
    expect(entries.some((entry) => /controller|internal package|button outline/.test(entry.text))).toBe(false);
    expect(entries.some((entry) => entry.text === 'Try again')).toBe(true);
    expect(renderInventory(entries, 1)).toContain('src/Example.tsx:4');
  });
  it('preserves inline spacing and inventories event-handler messages', () => {
    const entries = extractCopy(
      'src/Example.tsx',
      `
export function Example() {
  return <><p>The <strong>Core 50</strong> are games.{' '}About &amp; credits.</p>
    <button onClick={() => { if (failed) setError('Try again.'); }}>Retry</button></>;
}`,
    );
    expect(renderInventory(entries, 1)).toContain('The Core 50 are games. About &amp; credits.');
    expect(
      entries.some(
        (entry) =>
          entry.text.includes('Try again.') &&
          entry.condition.includes('onClick') &&
          entry.condition.includes('failed is true'),
      ),
    ).toBe(true);
  });
  it('excludes paths, class names and schema keys without excluding human labels', () => {
    const entries = extractCopy(
      'src/Example.ts',
      `
const path = 'src/components/app/Thing.tsx';
const errorName = 'PersonalLibraryBlockedError';
const keys = 'id,version,revision';
const labels = ['Settings', 'Play later', 'RPG'];
`,
    );
    expect(entries.map((entry) => entry.text)).toEqual(['Play later', 'RPG', 'Settings']);
  });
  it('records the standalone offline fallback with exact source lines', () => {
    const entries = extractHtmlCopy(
      'public/pwa/offline.html',
      '<body>\n<h1>You are offline.</h1>\n<p>Try <a href="/">The 100</a> again.</p>',
    );
    expect(entries).toEqual([
      expect.objectContaining({ line: 2, text: 'You are offline.', condition: 'Navigation unavailable while offline' }),
      expect.objectContaining({ line: 3, text: 'Try The 100 again.' }),
    ]);
  });
  it('names the disclosure that must be expanded to read its help', () => {
    const entries = extractCopy(
      'src/Example.tsx',
      '<details><summary>Exact source genre</summary><p>Genres can overlap.</p></details>',
    );
    expect(entries.find((entry) => entry.text === 'Genres can overlap.')?.condition).toContain(
      'expanded "Exact source genre" disclosure',
    );
  });
});
