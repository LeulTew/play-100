import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GITLEAKS_ARCHIVES,
  GITLEAKS_VERSION,
  gitleaksSummary,
  historyPatchCounts,
  prepareGitleaks,
  verifyGitleaksArchive,
} from './release-gitleaks';

describe('pinned history secret scan', () => {
  it('pins release archives and refuses unknown platforms, tampered bytes and a missing archive', async () => {
    expect(GITLEAKS_VERSION).toBe('8.30.1');
    expect(GITLEAKS_ARCHIVES['win32-x64']?.sha256).toBe(
      'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e',
    );
    for (const platform of Object.keys(GITLEAKS_ARCHIVES))
      expect(() => verifyGitleaksArchive(Buffer.from('not the release archive'), platform)).toThrow(
        'checksum mismatch',
      );
    expect(() => verifyGitleaksArchive(Buffer.alloc(0), 'unknown')).toThrow('No reviewed');
    await expect(prepareGitleaks('.', '.', undefined)).rejects.toThrow('PLAY100_GITLEAKS_ARCHIVE');
  });

  it('separates binary-only commits from mixed text/binary and no-patch commits', () => {
    const [binary, text, empty] = ['a', 'b', 'c'].map((char) => char.repeat(40));
    expect(
      historyPatchCounts(`${binary}\n\n-\t-\timage.png\n${text}\n1\t0\ttext.ts\n-\t-\timage.png\n${empty}\n`),
    ).toEqual({
      reachableCommits: 3,
      binaryOnlyCommits: [binary],
      noFilePatchCommits: [empty],
    });
    expect(() => historyPatchCounts('')).toThrow('empty');
    expect(() => historyPatchCounts(`${binary}\nunexpected`)).toThrow('Unexpected');
  });

  it('binds the actual candidate ancestry, reported count and empty native report', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gate-history-'));
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'gc.auto=0',
          '-c',
          'user.name=LeulTew',
          '-c',
          'user.email=107800362+LeulTew@users.noreply.github.com',
          ...args,
        ],
        { cwd: directory, encoding: 'utf8' },
      ).trim();
    try {
      git('init', '--quiet');
      await writeFile(path.join(directory, 'text.txt'), 'fixture\n');
      git('add', '.');
      git('commit', '--quiet', '-m', 'Add text fixture');
      await writeFile(path.join(directory, 'binary.png'), Buffer.from([0, 1, 2, 3]));
      git('add', '.');
      git('commit', '--quiet', '-m', 'Add binary fixture');
      const sha = git('rev-parse', 'HEAD');
      expect(gitleaksSummary(directory, sha, 'INF 1 commits scanned.', [])).toMatchObject({
        scannedRef: sha,
        reachableCommits: 2,
        scannedCommits: 1,
        binaryOnlyCommits: [sha],
        excludedFromScannerCount: 1,
        findings: 0,
      });
      expect(
        gitleaksSummary(directory, sha, '\u001b[32mINF\u001b[0m \u001b[1m1 commits scanned.\u001b[0m', [])
          .scannedCommits,
      ).toBe(1);
      expect(() => gitleaksSummary(directory, sha, 'no count', [])).toThrow('scanned-commit count');
      expect(() => gitleaksSummary(directory, sha, '3 commits scanned.', [])).toThrow('scanned-commit count');
      expect(() => gitleaksSummary(directory, sha, '1 commits scanned.', [{}])).toThrow('zero findings');
      expect(() => gitleaksSummary(directory, 'HEAD', '', [])).toThrow('full scanned');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
