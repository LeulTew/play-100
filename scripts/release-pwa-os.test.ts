import { describe, expect, it } from 'vitest';
import { assertAppWindow, assertOsHost, chromeAppId, isLaunchedAppTarget, parseOsArguments } from './release-pwa-os';

const url = 'https://play-100-collection.vercel.app/';
describe('Windows PWA evidence boundaries', () => {
  it('accepts only the production root and never accepts an existing profile', () => {
    expect(parseOsArguments(['--url', url])).toBe(url);
    for (const args of [
      [],
      ['--url', 'http://localhost:3000'],
      ['--url', `${url}?x=1`],
      ['--url', url, '--profile', 'Default'],
    ])
      expect(() => parseOsArguments(args)).toThrow();
  });
  it('requires the host lock absent and at least six GiB available', () => {
    const minimum = 6 * 1024 ** 3;
    expect(() => assertOsHost({ lockPresent: false, freeBytes: minimum })).not.toThrow();
    for (const freeBytes of [minimum - 1, 0, NaN, Infinity])
      expect(() => assertOsHost({ lockPresent: false, freeBytes })).toThrow();
    expect(() => assertOsHost({ lockPresent: true, freeBytes: minimum * 2 })).toThrow();
    expect(() => assertOsHost({ lockPresent: true, lockOwned: true, freeBytes: minimum })).not.toThrow();
    expect(() => assertOsHost({ lockPresent: true, lockOwned: false, freeBytes: minimum })).toThrow();
    expect(() => assertOsHost({ lockPresent: false, freeBytes: 4 * 1024 ** 3 }, 4)).not.toThrow();
    expect(() => assertOsHost({ lockPresent: false, freeBytes: 4 * 1024 ** 3 - 1 }, 4)).toThrow();
    expect(() => assertOsHost({ lockPresent: false, freeBytes: minimum }, 3)).toThrow();
  });
  it('derives a deterministic Chrome application identifier', () => {
    expect(chromeAppId('https://www.chromestatus.com/features')).toBe('fedbieoalmbobgfjapopkghdmhgncnaa');
    expect(chromeAppId('https://example.com/subapp')).toBe('ghmpeckcpimfdekfodogbnnpmkppngmo');
    expect(chromeAppId(url)).toMatch(/^[a-p]{32}$/);
    expect(chromeAppId(url)).toBe(chromeAppId(url));
    expect(chromeAppId(`${url}other`)).not.toBe(chromeAppId(url));
  });
  it('refuses a browser tab, error page, wrong route or title', () => {
    const evidence = { url, title: 'The 100 | Play 100', standalone: true, errorPage: false };
    expect(() => assertAppWindow(evidence, url)).not.toThrow();
    for (const change of [{ standalone: false }, { errorPage: true }, { title: 'Play 100' }, { url: `${url}my-games` }])
      expect(() => assertAppWindow({ ...evidence, ...change }, url)).toThrow();
  });
  it('binds a launched tab target to its child page without accepting unrelated targets', () => {
    expect(isLaunchedAppTarget({ targetId: 'app', type: 'page' }, 'app')).toBe(true);
    expect(isLaunchedAppTarget({ targetId: 'page', parentId: 'app', type: 'page' }, 'app')).toBe(true);
    expect(isLaunchedAppTarget({ targetId: 'page', parentId: 'other', type: 'page' }, 'app')).toBe(false);
    expect(isLaunchedAppTarget({ targetId: 'page', type: 'page' }, 'app')).toBe(false);
    expect(isLaunchedAppTarget({ targetId: 'app', type: 'tab' }, 'app')).toBe(false);
    expect(isLaunchedAppTarget({ targetId: 'frame', parentId: 'app', type: 'iframe' }, 'app')).toBe(false);
  });
});
