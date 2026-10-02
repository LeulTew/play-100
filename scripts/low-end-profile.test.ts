import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  DRIVER,
  initScript,
  median,
  PHASES,
  phaseTasks,
  pick,
  routePattern,
  SLOW_4G,
  SUMMARY_KEYS,
} from './low-end-profile';

const deployment = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  rewrites: { source: string; destination: string }[];
  headers: { source: string }[];
};

describe('low-end phone profile', () => {
  it('compiles the page scripts it injects, as the browser will parse them', () => {
    for (const source of [DRIVER, initScript(true), initScript(false)])
      expect(() => new Script(`(function () { return ${source}\n})`)).not.toThrow();
    expect(initScript(true)).toContain("classList.contains('p100-probe')");
  });

  it('records the URL a game link left and when each step of the visit began', () => {
    // A detail opens by adding ?game= to the URL: on a phone without URLSearchParams.size the click left it unchanged.
    expect(DRIVER).toContain('result.detailUrl = location.pathname + location.search');
    for (const name of ['scrollHome', 'discover', 'scrollDiscover', 'the100', 'detail', 'back', 'myGames', 'end'])
      expect(DRIVER).toContain(`step('${name}')`);
    // A trace of the visit finds the same boundaries as user timing marks.
    expect(DRIVER).toContain("performance.mark('p100:' + name)");
  });

  it("matches vercel.json's sources as Vercel does, its :name segments included", () => {
    const rewrite = (path: string) => deployment.rewrites.some((rule) => routePattern(rule.source).test(path));
    expect(rewrite('/discover')).toBe(true);
    expect(rewrite('/friends/abc123')).toBe(true);
    expect(rewrite('/u/someone')).toBe(true);
    expect(rewrite('/assets/app.js')).toBe(false);
    const main = deployment.headers.map((rule) => routePattern(rule.source))[0]!;
    expect(main.test('/')).toBe(true);
    expect(main.test('/__/auth/handler')).toBe(false);
  });

  it("uses DevTools' Slow 4G and takes medians over the measured runs only", () => {
    expect(SLOW_4G).toMatchObject({ latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 });
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([Number.NaN])).toBeNull();
    expect(pick({ scrollHome: { fps: 48 } }, 'scrollHome.fps')).toBe(48);
    expect(pick({ detail: null }, 'detail.ms')).toBeNaN();
  });

  it('splits a visit’s long tasks by what the driver was doing when each started', () => {
    const steps = {
      scrollHome: 9000,
      discover: 15000,
      scrollDiscover: 20000,
      the100: 25000,
      detail: 28000,
      back: 31000,
      myGames: 33000,
      end: 36000,
    };
    const phases = phaseTasks(steps, [
      [2000, 400],
      [4000, 120],
      [9100, 60],
      [15100, 300],
      [15600, 90],
      [28050, 70],
      [35999, 51],
      [36000, 500],
    ]);
    expect(Object.keys(phases)).toEqual([...PHASES]);
    expect(phases.startup).toEqual({ ms: 520, count: 2, worstMs: 400 });
    expect(phases.scrollHome).toEqual({ ms: 60, count: 1, worstMs: 60 });
    expect(phases.discover).toEqual({ ms: 390, count: 2, worstMs: 300 });
    expect(phases.scrollDiscover).toEqual({ ms: 0, count: 0, worstMs: 0 });
    expect(phases.detail).toEqual({ ms: 70, count: 1, worstMs: 70 });
    expect(phases.myGames).toEqual({ ms: 51, count: 1, worstMs: 51 });
    expect(phaseTasks({}, [[1, 60]]).startup?.ms).toBeNaN();
    expect(SUMMARY_KEYS).toContain('phases.discover.ms');
  });
});
