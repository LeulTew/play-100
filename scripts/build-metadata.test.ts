import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertPublicBuildOutput,
  assertPublicPrecachePaths,
  buildManifestPath,
  readBuildManifest,
  retainBuildManifest,
} from './build-metadata';

const folders: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'play100-build-metadata-'));
  folders.push(root);
  const output = path.join(root, 'dist');
  await mkdir(path.join(output, 'assets'), { recursive: true });
  await writeFile(path.join(output, 'assets', 'main.js'), 'export const ready = true;');
  return { root, output };
}
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true, maxRetries: 5 });
});

describe('private build metadata', () => {
  it('refuses an output path that would contain the retained metadata', () => {
    expect(() => buildManifestPath(path.join(tmpdir(), '.build-meta'))).toThrow('outside the deploy output');
  });

  it('moves the manifest outside dist, replaces old build metadata, and preserves all public bytes', async () => {
    const { root, output } = await fixture();
    const manifest = '{"index.html":{"file":"assets/main.js"}}\n';
    const publicFiles = {
      'index.html': '<script type="module" src="/assets/main.js"></script>',
      'sw.js': '/* same service worker bytes */',
      'pwa-assets.json': '{"core":[{"url":"/assets/main.js"}]}',
    };
    for (const [file, bytes] of Object.entries(publicFiles)) await writeFile(path.join(output, file), bytes);
    await mkdir(path.join(output, '.vite'));
    await writeFile(path.join(output, '.vite', 'manifest.json'), manifest);
    const destination = buildManifestPath(output);
    expect(destination).toBe(path.join(root, '.build-meta', 'dist', 'vite-manifest.json'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, '{"obsolete":true}');
    await expect(retainBuildManifest(output)).resolves.toEqual(JSON.parse(manifest));
    expect(await readFile(destination, 'utf8')).toBe(manifest);
    expect(await readdir(output)).not.toContain('.vite');
    await expect(readBuildManifest(output)).resolves.toEqual(JSON.parse(manifest));
    await expect(assertPublicBuildOutput(output)).resolves.toBeUndefined();
    for (const [file, bytes] of Object.entries(publicFiles))
      expect(await readFile(path.join(output, file), 'utf8')).toBe(bytes);
  });

  it('fails rather than reusing stale metadata when this build did not emit a manifest', async () => {
    const { output } = await fixture();
    await mkdir(path.dirname(buildManifestPath(output)), { recursive: true });
    await writeFile(buildManifestPath(output), '{}');
    await expect(retainBuildManifest(output)).rejects.toThrow();
  });

  it('refuses to recursively discard unexpected staging files', async () => {
    const { output } = await fixture();
    await mkdir(path.join(output, '.vite'));
    await writeFile(path.join(output, '.vite', 'manifest.json'), '{}');
    await writeFile(path.join(output, '.vite', 'unexpected.json'), '{}');
    await expect(retainBuildManifest(output)).rejects.toThrow('Unexpected files in Vite manifest staging');
    expect(await readdir(path.join(output, '.vite'))).toContain('unexpected.json');
  });

  it.each(['.vite', 'assets/.vite'])('rejects even an empty deployed %s directory', async (relative) => {
    const { output } = await fixture();
    const directory = path.join(output, ...relative.split('/'));
    await mkdir(directory);
    await expect(assertPublicBuildOutput(output)).rejects.toThrow('Build metadata must not be deployed');
    await rm(directory, { recursive: true });
    await expect(assertPublicBuildOutput(output)).resolves.toBeUndefined();
  });

  it.each(['main.js.map', 'assets/styles.css.map'])(
    'rejects deployed sourcemap %s but accepts the same output without it',
    async (relative) => {
      const { output } = await fixture();
      const file = path.join(output, ...relative.split('/'));
      await writeFile(file, '{"sources":["src/App.tsx"]}');
      await expect(assertPublicBuildOutput(output)).rejects.toThrow('Build metadata must not be deployed');
      await rm(file);
      await expect(assertPublicBuildOutput(output)).resolves.toBeUndefined();
    },
  );

  it.each(['/.vite/manifest.json', '/assets/.vite/manifest.json', '/%2evite/manifest.json', '/assets/main.js.map'])(
    'rejects precache metadata entry %s',
    (url) => {
      expect(() => assertPublicPrecachePaths(['/index.html', url])).toThrow(
        'Build metadata must not enter the public precache',
      );
      expect(() =>
        assertPublicPrecachePaths(['/index.html', '/assets/main.js', '/manifest.webmanifest']),
      ).not.toThrow();
    },
  );
});
