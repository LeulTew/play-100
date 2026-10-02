import { describe, expect, it } from 'vitest';
import {
  format,
  median,
  parseReportName,
  summarise,
  summariseRun,
  type LighthouseReport,
} from './lighthouse-summary.ts';

function report(performance: number, lcp: number, selector = 'main > h1'): LighthouseReport {
  return {
    lighthouseVersion: '12.8.2',
    environment: { hostUserAgent: 'HeadlessChrome/153' },
    finalDisplayedUrl: 'https://127.0.0.1:4300/',
    categories: { performance: { score: performance }, accessibility: { score: 1 } },
    audits: {
      'first-contentful-paint': { numericValue: 500 },
      'largest-contentful-paint': { numericValue: lcp },
      'speed-index': { numericValue: 700 },
      'total-blocking-time': { numericValue: 0 },
      'cumulative-layout-shift': { numericValue: 0.0012 },
      'largest-contentful-paint-element': { details: { items: [{ items: [{ node: { selector } }] }] } },
    },
  };
}

describe('parseReportName', () => {
  it('reads cells whose names contain dashes', () => {
    expect(parseReportName('lh-linux-tall-fallback-mobile-3.report.json')).toEqual({
      cell: 'linux-tall-fallback',
      form: 'mobile',
      run: 3,
    });
  });

  it('ignores other files', () => {
    expect(parseReportName('lh-linux-dejavu-mobile-1.report.html')).toBeNull();
    expect(parseReportName('summary.json')).toBeNull();
  });
});

describe('summariseRun', () => {
  it('takes the scores, the metrics and the LCP element', () => {
    const run = summariseRun('lh-linux-dejavu-desktop-2.report.json', report(0.99, 2103));
    expect(run).toMatchObject({
      cell: 'linux-dejavu',
      form: 'desktop',
      run: 2,
      lighthouseVersion: '12.8.2',
      userAgent: 'HeadlessChrome/153',
      scores: { performance: 0.99, accessibility: 1 },
      lcp: 2103,
      cls: 0.0012,
      lcpSelector: 'main > h1',
      runtimeError: null,
    });
  });

  it('records missing audits as null', () => {
    const run = summariseRun('lh-x-mobile-1.report.json', { categories: {}, audits: {} });
    expect(run.lcp).toBeNull();
    expect(run.lcpSelector).toBeNull();
  });
});

describe('median', () => {
  it('takes the middle value, skipping nulls', () => {
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([1, 2])).toBe(2);
    expect(median([null])).toBeNull();
  });
});

describe('summarise and format', () => {
  it('groups runs per cell and form factor', () => {
    const runs = [
      summariseRun('lh-a-mobile-1.report.json', report(0.98, 900)),
      summariseRun('lh-a-mobile-2.report.json', report(1, 800, 'main > p')),
      summariseRun('lh-a-mobile-3.report.json', report(0.99, 850)),
      summariseRun('lh-a-desktop-1.report.json', report(1, 400)),
    ];
    const medians = summarise(runs);
    expect(Object.keys(medians)).toEqual(['a/mobile', 'a/desktop']);
    expect(medians['a/mobile']).toMatchObject({
      runs: 3,
      scores: { performance: 0.99, accessibility: 1 },
      lcp: 850,
      lcpSelectors: ['main > h1', 'main > p'],
    });
    expect(format(medians)[0]).toBe(
      'a/mobile: performance 99, accessibility 100; FCP 500 ms, LCP 850 ms, SI 700 ms, TBT 0 ms, CLS 0.001; ' +
        'LCP element main > h1 | main > p',
    );
  });
});
