import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { holdRootFlag, ROOT_FLAGS } from './root-flag';

function fakeElement() {
  const attributes = new Map<string, string>();
  const element = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  } as unknown as Element;
  return { attributes, element };
}

// A :has() rule whose subject is the root, which Chromium 106 rematches on every insertion anywhere below it.
const ROOT_HAS = /(?:^|[^\w-])(?:html|body|:root)(?:\[[^\]]*\])*:has\(/m;
const source = fileURLToPath(new URL('..', import.meta.url));
const stylesheets = readdirSync(source, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.css'))
  .map((file) => ({ file, css: readFileSync(path.join(source, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));

describe('root flags', () => {
  it('holds an attribute while any holder asks for it', () => {
    const { attributes, element } = fakeElement();
    const first = holdRootFlag(element, ROOT_FLAGS.toast);
    const second = holdRootFlag(element, ROOT_FLAGS.toast);
    expect(attributes.get(ROOT_FLAGS.toast)).toBe('');
    first();
    expect(attributes.has(ROOT_FLAGS.toast)).toBe(true);
    second();
    expect(attributes.has(ROOT_FLAGS.toast)).toBe(false);
  });

  it('ignores a second release and keeps each attribute apart', () => {
    const { attributes, element } = fakeElement();
    const chip = holdRootFlag(element, ROOT_FLAGS.compareChip);
    const toast = holdRootFlag(element, ROOT_FLAGS.toast);
    chip();
    chip();
    expect(attributes.has(ROOT_FLAGS.compareChip)).toBe(false);
    expect(attributes.has(ROOT_FLAGS.toast)).toBe(true);
    const again = holdRootFlag(element, ROOT_FLAGS.compareChip);
    expect(attributes.has(ROOT_FLAGS.compareChip)).toBe(true);
    toast();
    again();
    expect([...attributes.keys()]).toEqual([]);
  });

  it('leaves no stylesheet with a :has() rule on html, body or :root', () => {
    expect(stylesheets.length).toBeGreaterThan(0);
    for (const { file, css } of stylesheets) expect(css, file).not.toMatch(ROOT_HAS);
  });

  it('styles each mirrored state from the root it is set on', () => {
    const tray = stylesheets.find(({ file }) => file.endsWith('compare-tray.css'));
    expect(tray).toBeDefined();
    expect(tray!.css).toContain(`html[${ROOT_FLAGS.compareChip}]`);
    expect(tray!.css).toContain(`html[${ROOT_FLAGS.toast}]`);
    expect(tray!.css).toContain(`body[${ROOT_FLAGS.trayReserve}]`);
  });
});
