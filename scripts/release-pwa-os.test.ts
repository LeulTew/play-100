import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertAppWindow,
  assertOsHost,
  chromeAppId,
  isLaunchedAppTarget,
  osWorkBudget,
  parseOsArguments,
} from './release-pwa-os';

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
  it('requires the host lock absent or owned and at least six GiB available', () => {
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
  it.runIf(process.platform === 'win32')(
    'checks only the configured host lock and validates token and expiry',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'play100-host-guard-'));
      const path = join(directory, 'host.lock');
      const run = (lockPath: string, token: string) => {
        const result = spawnSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-File', 'scripts\\release-pwa-os-windows.ps1', '-Action', 'guard'],
          {
            encoding: 'utf8',
            timeout: 10000,
            windowsHide: true,
            env: { ...process.env, PLAY100_HOST_LOCK: lockPath, PLAY100_HOST_LOCK_TOKEN: token },
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr).toBe(0);
        return JSON.parse(result.stdout) as { lockPresent: boolean; lockOwned: boolean; lockExpiresAt: string | null };
      };
      try {
        expect(run('', 'fixture')).toMatchObject({ lockPresent: false, lockOwned: false, lockExpiresAt: null });
        expect(run(path, 'fixture')).toMatchObject({ lockPresent: false, lockOwned: false });
        const future = new Date(Date.now() + 600000).toISOString();
        writeFileSync(path, JSON.stringify({ token: 'fixture', expectedRelease: future, holder: 'another job name' }));
        expect(run(path, 'fixture')).toMatchObject({ lockPresent: true, lockOwned: true, lockExpiresAt: future });
        for (const token of ['', 'wrong', 'Fixture'])
          expect(run(path, token)).toMatchObject({ lockPresent: true, lockOwned: false, lockExpiresAt: null });
        for (const expectedRelease of ['2000-01-01T00:00:00Z', 'invalid', null]) {
          writeFileSync(path, JSON.stringify({ token: 'fixture', expectedRelease }));
          expect(run(path, 'fixture')).toMatchObject({ lockPresent: true, lockOwned: false, lockExpiresAt: null });
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    30000,
  );
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
  it('reserves cleanup time before the owned host slot ends', () => {
    const now = Date.parse('2026-10-01T19:00:00Z');
    expect(osWorkBudget(now)).toBe(720000);
    expect(osWorkBudget(now, '2026-10-01T19:10:00Z')).toBe(480000);
    expect(osWorkBudget(now, '2026-10-01T19:03:00Z')).toBe(60000);
    expect(() => osWorkBudget(now, '2026-10-01T19:02:59Z')).toThrow();
    expect(() => osWorkBudget(now, 'invalid')).toThrow();
  });
});
