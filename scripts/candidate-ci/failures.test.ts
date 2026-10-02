import { describe, expect, it } from 'vitest';
import { firstError, playwrightFailures, vitestFailures } from './failures';

const playwright = {
  stats: {},
  suites: [
    {
      title: 'menu.spec.ts',
      file: 'menu.spec.ts',
      suites: [
        {
          title: 'menu',
          specs: [
            {
              title: 'opens',
              file: 'menu.spec.ts',
              line: 412,
              tests: [
                {
                  projectName: 'desktop',
                  results: [
                    { status: 'passed', repeatEachIndex: 0, errors: [], attachments: [] },
                    {
                      status: 'failed',
                      repeatEachIndex: 1,
                      errors: [{ message: '\u001b[31mError: expected\u001b[39m visible' }, { message: 'second' }],
                      attachments: [
                        { name: 'trace', contentType: 'application/zip', path: '/out/test-results/a/trace.zip' },
                        { name: 'screenshot', contentType: 'image/png', path: '/out/test-results/a/failed.png' },
                        {
                          name: 'error-context',
                          contentType: 'text/markdown',
                          path: '/out/test-results/a/error-context.md',
                        },
                        { name: 'video', contentType: 'video/webm', path: '/out/test-results/a/video.webm' },
                      ],
                    },
                    {
                      status: 'timedOut',
                      repeatEachIndex: 2,
                      errors: [],
                      error: { message: 'Timeout' },
                      attachments: [],
                    },
                    { status: 'skipped', repeatEachIndex: 3, errors: [], attachments: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('playwrightFailures', () => {
  it('lists every failed attempt with its first error and kept attachments', () => {
    const failures = playwrightFailures(playwright, 'playwright.json');
    expect(failures).toEqual([
      {
        report: 'playwright.json',
        title: 'menu › opens',
        location: 'menu.spec.ts:412',
        project: 'desktop',
        status: 'failed',
        repeatEachIndex: 1,
        error: 'Error: expected visible',
        attachments: ['/out/test-results/a/failed.png', '/out/test-results/a/error-context.md'],
      },
      expect.objectContaining({ status: 'timedOut', repeatEachIndex: 2, error: 'Timeout', attachments: [] }),
    ]);
  });

  it('returns nothing for a malformed or passing report', () => {
    expect(playwrightFailures(null, 'x.json')).toEqual([]);
    expect(
      playwrightFailures({ suites: [{ specs: [{ tests: [{ results: [{ status: 'passed' }] }] }] }] }, 'x'),
    ).toEqual([]);
  });
});

describe('vitestFailures', () => {
  it('lists failed assertions relative to the checkout', () => {
    const report = {
      testResults: [
        {
          name: '/repo/tests-cloud/friend-all.test.ts',
          assertionResults: [
            { status: 'passed', fullName: 'ok' },
            {
              status: 'failed',
              fullName: 'friends converges',
              location: { line: 30, column: 3 },
              failureMessages: ['AssertionError: no'],
            },
          ],
        },
      ],
    };
    expect(vitestFailures(report, 'vitest-1.json', '/repo')).toEqual([
      {
        report: 'vitest-1.json',
        title: 'friends converges',
        location: 'tests-cloud/friend-all.test.ts:30',
        project: null,
        status: 'failed',
        repeatEachIndex: null,
        error: 'AssertionError: no',
        attachments: [],
      },
    ]);
  });
});

describe('firstError', () => {
  it('strips colour codes and caps the length', () => {
    expect(firstError('\u001b[2m a \u001b[22m')).toBe('a');
    expect(firstError('x'.repeat(5000))).toHaveLength(4001);
  });
});
