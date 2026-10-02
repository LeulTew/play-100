import { describe, expect, it } from 'vitest';
import { CONTROL_VARIANTS, controlPage, controlPath, parseSuite } from './control-page.ts';

const variant = (id: string) => {
  const found = CONTROL_VARIANTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('parseSuite', () => {
  it('defaults to the product journeys', () => {
    expect(parseSuite(undefined)).toBe('product');
    expect(parseSuite('  ')).toBe('product');
  });

  it('accepts the control suite and rejects anything else', () => {
    expect(parseSuite('control')).toBe('control');
    expect(() => parseSuite('everything')).toThrow(/SR_SUITE/);
  });
});

describe('controlPage', () => {
  it('describes the dialog by the short line and autofocuses the heading', () => {
    const html = controlPage(variant('control-heading-describedby'));
    expect(html).toContain('aria-describedby="control-description"');
    expect(html).toMatch(/<h2 id="control-title" tabindex="-1" autofocus>/);
    expect(html).not.toMatch(/id="control-close" autofocus/);
  });

  it('can drop the description or move autofocus to Close', () => {
    expect(controlPage(variant('control-heading-plain'))).not.toContain('aria-describedby');
    const close = controlPage(variant('control-close-describedby'));
    expect(close).toMatch(/id="control-close" autofocus/);
    expect(close).toMatch(/<h2 id="control-title" tabindex="-1">/);
  });

  it('has no click listener on the dialog itself', () => {
    for (const each of CONTROL_VARIANTS) {
      expect(controlPage(each)).not.toMatch(/dialog\.addEventListener\('click'/);
    }
  });

  it('serves each variant at its own path', () => {
    expect(new Set(CONTROL_VARIANTS.map(controlPath)).size).toBe(CONTROL_VARIANTS.length);
  });
});
