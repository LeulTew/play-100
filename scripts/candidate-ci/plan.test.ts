import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dispatchArgs, findRun, parsePlan, requestId, resolvedBrowserEnv, runName, shellLine } from './plan.ts';

const sha = 'a49f27a665c18288e2b1bd253ca3244fc70a4a61';
const entry = (extra: Record<string, unknown> = {}) => ({ id: 'focus', suite: 'e2e-prod', ...extra });

describe('parsePlan', () => {
  it('accepts the committed final-tip plan', () => {
    const plan = parsePlan(JSON.parse(readFileSync(path.join(import.meta.dirname, 'plan.json'), 'utf8')));
    expect(plan.entries.length).toBeGreaterThan(30);
    expect(
      plan.entries
        .filter((row) => row.lean)
        .map((row) => row.lean)
        .sort(),
    ).toEqual([
      'cloud-rules',
      'cloud-ui-desktop',
      'cloud-ui-mobile',
      'e2e-development',
      'e2e-offline',
      'e2e-production',
      'films-download',
      'floor-smoke',
    ]);
    for (const id of [
      'frequent-action-focus-desktop',
      'rating-entry-focus',
      'removal-neighbor-focus',
      'back-closes-sheet',
    ])
      expect(plan.entries.find((row) => row.id === id)?.repeat).toBe(20);
  });

  it('fills defaults', () => {
    expect(parsePlan({ schemaVersion: 1, entries: [entry()] }).entries[0]).toEqual({
      id: 'focus',
      purpose: '',
      suite: 'e2e-prod',
      specs: [],
      project: 'both',
      repeat: 1,
      workers: null,
      grep: '',
      browserEnv: 'auto',
      lean: null,
      expectedPassed: null,
    });
  });

  it.each([
    [{ schemaVersion: 2, entries: [entry()] }, /schemaVersion/],
    [{ schemaVersion: 1, entries: [] }, /at least one/],
    [{ schemaVersion: 1, entries: [entry(), entry()] }, /duplicate id/],
    [{ schemaVersion: 1, entries: [entry({ id: 'Bad Id' })] }, /id must be/],
    [{ schemaVersion: 1, entries: [entry({ suite: 'e2e' })] }, /suite must be one of/],
    [{ schemaVersion: 1, entries: [entry({ specs: ['../secrets.ts'] })] }, /safe relative paths/],
    [{ schemaVersion: 1, entries: [entry({ specs: ['tests/a.spec.ts;rm'] })] }, /safe relative paths/],
    [{ schemaVersion: 1, entries: [entry({ repeat: 0 })] }, /repeat must be/],
    [{ schemaVersion: 1, entries: [entry({ workers: 100 })] }, /workers must be/],
    [{ schemaVersion: 1, entries: [entry({ grep: 'a\nb' })] }, /one line/],
    [{ schemaVersion: 1, entries: [entry({ project: 'tablet' })] }, /project must be/],
    [{ schemaVersion: 1, entries: [entry({ lean: 'cloud-rules' })] }, /comes from the cloud-rules suite/],
    [
      {
        schemaVersion: 1,
        entries: [entry({ lean: 'e2e-production' }), entry({ id: 'other', lean: 'e2e-production' })],
      },
      /already supplied/,
    ],
  ])('rejects %j', (input, error) => {
    expect(() => parsePlan(input)).toThrow(error);
  });
});

describe('dispatching', () => {
  const [row] = parsePlan({
    schemaVersion: 1,
    entries: [entry({ specs: ['tests/a.spec.ts', 'tests/b.spec.ts'], grep: "it's here", repeat: 20, workers: 1 })],
  }).entries;

  it('names requests and runs by entry, sha and nonce', () => {
    const request = requestId(row!, sha, 'm1abc');
    expect(request).toBe('focus.a49f27a6.m1abc');
    expect(runName(row!, sha, request)).toBe(`Candidate CI e2e-prod both ${sha} focus.a49f27a6.m1abc`);
    expect(() => requestId({ id: 'x'.repeat(60) }, sha, 'nonce')).toThrow(/not valid/);
  });

  it('passes every workflow input', () => {
    expect(dispatchArgs(row!, sha, 'leultew-r24-candidate-ci', 'req', 'LeulTew/play-100')).toEqual([
      'workflow',
      'run',
      'candidate-ci.yml',
      '--repo',
      'LeulTew/play-100',
      '--ref',
      'leultew-r24-candidate-ci',
      '-f',
      `sha=${sha}`,
      '-f',
      'suite=e2e-prod',
      '-f',
      'specs=tests/a.spec.ts tests/b.spec.ts',
      '-f',
      'project=both',
      '-f',
      'repeat=20',
      '-f',
      'workers=1',
      '-f',
      "grep=it's here",
      '-f',
      'browser_env=auto',
      '-f',
      'request=req',
    ]);
  });

  it('quotes shell lines', () => {
    expect(shellLine('gh', ['-f', "grep=it's here", 'repeat=2'])).toBe(`gh -f 'grep=it'\\''s here' repeat=2`);
  });

  it('matches runs by exact name and refuses ambiguity', () => {
    const runs = [{ displayTitle: 'a b' }, { displayTitle: 'a bc' }];
    expect(findRun(runs, 'a b')).toBe(runs[0]);
    expect(findRun(runs, 'a')).toBeNull();
    expect(() => findRun([...runs, { displayTitle: 'a b' }], 'a b')).toThrow(/More than one/);
  });

  it('resolves the browser environment as run-suite.sh does', () => {
    expect(resolvedBrowserEnv({ suite: 'e2e-dev', browserEnv: 'auto' })).toBe('xvfb-headed');
    expect(resolvedBrowserEnv({ suite: 'e2e-prod', browserEnv: 'auto' })).toBe('default');
    expect(resolvedBrowserEnv({ suite: 'e2e-offline', browserEnv: 'auto' })).toBe('xvfb-headed');
    expect(resolvedBrowserEnv({ suite: 'cloud-ui', browserEnv: 'auto' })).toBe('default');
    expect(resolvedBrowserEnv({ suite: 'e2e-offline', browserEnv: 'default' })).toBe('default');
    expect(resolvedBrowserEnv({ suite: 'e2e-dev', browserEnv: 'unthrottled' })).toBe('unthrottled');
  });
});
