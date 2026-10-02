import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadShellRenderer } from './render-shell.ts';
import { withShell } from './shell-html.ts';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('the build-time shell renderer', () => {
  it('renders the shells of the reviewed index.html snapshots from the source tree', async () => {
    // The build loads the components through Vite's module runner, with React's production JSX runtime; the snapshots
    // come from src/first-paint/shell-render.test.ts, which renders them under the test transform.
    const renderShell = await loadShellRenderer(repository);
    const indexHtml = read('index.html');
    for (const variant of ['offline', 'online'] as const) {
      expect(withShell(indexHtml, renderShell(variant)), variant).toBe(
        read(`src/first-paint/__snapshots__/index.${variant}.html`),
      );
    }
  });
});
