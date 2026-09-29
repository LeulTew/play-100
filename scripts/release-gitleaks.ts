import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

export const GITLEAKS_VERSION = '8.30.1';
// Digests published with https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1.
export const GITLEAKS_ARCHIVES: Readonly<Record<string, { name: string; sha256: string }>> = {
  'win32-x64': {
    name: 'gitleaks_8.30.1_windows_x64.zip',
    sha256: 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e',
  },
  'linux-x64': {
    name: 'gitleaks_8.30.1_linux_x64.tar.gz',
    sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  },
  'darwin-arm64': {
    name: 'gitleaks_8.30.1_darwin_arm64.tar.gz',
    sha256: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
  },
  'darwin-x64': {
    name: 'gitleaks_8.30.1_darwin_x64.tar.gz',
    sha256: 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  },
};

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export function verifyGitleaksArchive(bytes: Buffer, platform = `${process.platform}-${process.arch}`) {
  const pinned = GITLEAKS_ARCHIVES[platform];
  if (!pinned) throw new Error(`No reviewed Gitleaks archive for ${platform}.`);
  if (digest(bytes) !== pinned.sha256) throw new Error(`Gitleaks ${pinned.name} checksum mismatch.`);
  return pinned;
}

export async function prepareGitleaks(checkout: string, evidence: string, archive: string | undefined) {
  if (!archive) throw new Error('Set PLAY100_GITLEAKS_ARCHIVE to the reviewed Gitleaks 8.30.1 release archive.');
  if (
    execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: checkout, encoding: 'utf8' }).trim() !==
    'false'
  )
    throw new Error('Gitleaks requires complete candidate history, not a shallow checkout.');
  const platform = `${process.platform}-${process.arch}`;
  const selected = GITLEAKS_ARCHIVES[platform];
  if (!selected) throw new Error(`No reviewed Gitleaks archive for ${platform}.`);
  const directory = path.join(evidence, 'gitleaks-tool');
  await mkdir(directory);
  const local = path.join(directory, selected.name);
  await copyFile(archive, local);
  const pinned = verifyGitleaksArchive(await readFile(local));
  const binary = process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks';
  execFileSync('tar', ['-xf', local, '-C', directory, binary], { stdio: 'pipe' });
  const executable = path.join(directory, binary);
  if (!(await stat(executable)).isFile()) throw new Error('Verified Gitleaks archive has no executable.');
  const version = execFileSync(executable, ['version'], { encoding: 'utf8' }).trim();
  if (version !== GITLEAKS_VERSION) throw new Error(`Unexpected Gitleaks version: ${version}.`);
  return {
    executable,
    receipt: {
      version,
      archive: pinned.name,
      archiveSha256: pinned.sha256,
      executableSha256: digest(await readFile(executable)),
    },
  };
}

export function historyPatchCounts(numstat: string) {
  const commits = new Map<string, { binary: boolean; text: boolean }>();
  let current: { binary: boolean; text: boolean } | undefined;
  for (const line of numstat.split(/\r?\n/)) {
    if (/^[a-f0-9]{40}$/.test(line)) {
      current = { binary: false, text: false };
      commits.set(line, current);
    } else if (/^-\t-\t/.test(line) && current) current.binary = true;
    else if (/^\d+\t\d+\t/.test(line) && current) current.text = true;
    else if (line.trim()) throw new Error('Unexpected candidate history count output.');
  }
  if (!commits.size) throw new Error('Candidate history is empty.');
  return {
    reachableCommits: commits.size,
    binaryOnlyCommits: [...commits].filter(([, value]) => value.binary && !value.text).map(([sha]) => sha),
    noFilePatchCommits: [...commits].filter(([, value]) => !value.binary && !value.text).map(([sha]) => sha),
  };
}

export function gitleaksSummary(checkout: string, sha: string, log: string, report: unknown) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Gitleaks needs the full scanned candidate ref.');
  if (!Array.isArray(report) || report.length) throw new Error('Gitleaks report must contain zero findings.');
  const counts = historyPatchCounts(
    execFileSync('git', ['-c', 'core.quotePath=true', 'log', '--full-history', '--format=%H', '--numstat', sha], {
      cwd: checkout,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
  const match = stripVTControlCharacters(log).match(/\b(\d+) commits scanned\b/);
  const scannedCommits = match ? Number(match[1]) : 0;
  if (!scannedCommits || scannedCommits > counts.reachableCommits)
    throw new Error('Missing or inconsistent Gitleaks scanned-commit count.');
  return {
    scannedRef: sha,
    ...counts,
    scannedCommits,
    excludedFromScannerCount: counts.reachableCommits - scannedCommits,
    countExplanation:
      'The scanner counts commits yielding scanned fragments, not every reachable commit. Binary-only PNG commits have no text patch and are excluded; empty/merge commits and commits without additions can also be absent. Binary archives may be scanned separately. Lists above describe Git patches, not a claim that every binary was scanned.',
    findings: 0,
  };
}
