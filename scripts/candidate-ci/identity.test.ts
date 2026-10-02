import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIdentity, evidenceFiles, parseFontCell, type IdentityFacts } from './identity.ts';

const facts: IdentityFacts = {
  commit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  packageLockSha256: 'c'.repeat(64),
  builtIndexHtmlSha256: null,
  os: 'Ubuntu 24.04.3 LTS',
  kernel: '6.11.0-1018-azure',
  node: 'v24.21.0',
  npm: '11.6.0',
  versions: { playwright: '1.63.0', vitest: '5.0.3', firebaseTools: '15.31.0', lighthouse: null },
  browser: { name: 'chromium', version: '153.0.8010.12', executable: '/ms-playwright/chrome' },
  floorBrowsers: [{ name: 'floor-chromium', version: 'Chromium 106.0.5249.0', executable: '/tmp/chrome' }],
  fonts: { system: { 'sans-serif': 'DejaVuSans.ttf: "DejaVu Sans" "Book"', serif: null }, cells: [] },
  files: [{ path: 'playwright.json', bytes: 2, sha256: 'e'.repeat(64) }],
  recordedAt: '2026-10-02T02:00:00.000Z',
};

describe('buildIdentity', () => {
  it('records the inputs, the runner and the run URL from the environment', () => {
    const identity = buildIdentity(facts, {
      REQUESTED_SHA: 'a'.repeat(40),
      SUITE: 'e2e-prod',
      SPECS: 'tests/a.spec.ts',
      PROJECT: 'both',
      REPEAT: '3',
      WORKERS: '',
      GREP: 'restart',
      BUILD_PROFILE: 'configured',
      SUITE_OUTCOME: 'success',
      ImageOS: 'ubuntu24',
      ImageVersion: '20260927.320.1',
      JAVA_VERSION_LINE: '',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'LeulTew/play-100',
      GITHUB_RUN_ID: '42',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REF: 'refs/heads/leultew-r24-candidate-ci',
      WORKFLOW_SHA: 'd'.repeat(40),
    });
    expect(identity).toMatchObject({
      commit: facts.commit,
      requestedSha: 'a'.repeat(40),
      build: 'configured',
      suite: 'e2e-prod',
      repeat: '3',
      workers: null,
      grep: 'restart',
      java: null,
      outcome: 'success',
      runner: { imageOS: 'ubuntu24', imageVersion: '20260927.320.1', os: facts.os },
      playwright: '1.63.0',
      lighthouse: null,
      fonts: facts.fonts,
      files: facts.files,
      workflow: { run: 'https://github.com/LeulTew/play-100/actions/runs/42', workflowSha: 'd'.repeat(40) },
    });
  });

  it('leaves what the environment does not say as null, and the build as none', () => {
    const identity = buildIdentity(facts, {});
    expect(identity.build).toBe('none');
    expect(identity.suite).toBeNull();
    expect(identity.specs).toBe('');
    expect(identity.workflow.run).toBeNull();
  });
});

describe('parseFontCell', () => {
  it('reads the cell, its fontconfig file, the fc-match lines and the family list', () => {
    const text = [
      'cell: linux-dejavu',
      'FONTCONFIG_FILE: /tmp/fonts-android-path.conf',
      'fc-match Impact: DejaVuSans.ttf: "DejaVu Sans" "Book"',
      'fc-match sans-serif: DejaVuSans.ttf: "DejaVu Sans" "Book"',
      'fc-match serif: DejaVuSerif.ttf: "DejaVu Serif" "Book"',
      'fc-list families:',
      'DejaVu Sans',
      'DejaVu Serif',
      '',
    ].join('\n');
    expect(parseFontCell(text)).toEqual({
      cell: 'linux-dejavu',
      fontconfigFile: '/tmp/fonts-android-path.conf',
      match: {
        Impact: 'DejaVuSans.ttf: "DejaVu Sans" "Book"',
        'sans-serif': 'DejaVuSans.ttf: "DejaVu Sans" "Book"',
        serif: 'DejaVuSerif.ttf: "DejaVu Serif" "Book"',
      },
      families: ['DejaVu Sans', 'DejaVu Serif'],
    });
  });
});

describe('evidenceFiles', () => {
  it('digests every file but the identity file, by POSIX path relative to the artifact root', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'candidate-ci-'));
    try {
      mkdirSync(path.join(root, 'test-results', 'case'), { recursive: true });
      writeFileSync(path.join(root, 'playwright.json'), '{}');
      writeFileSync(path.join(root, 'test-results', 'case', 'error-context.md'), 'abc');
      writeFileSync(path.join(root, 'identity.json'), 'old');
      expect(evidenceFiles(root, path.join(root, 'identity.json'))).toEqual([
        {
          path: 'playwright.json',
          bytes: 2,
          sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
        },
        {
          path: 'test-results/case/error-context.md',
          bytes: 3,
          sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns no files when the artifact root does not exist', () => {
    expect(evidenceFiles(path.join(tmpdir(), 'candidate-ci-missing-root'), 'identity.json')).toEqual([]);
  });
});
