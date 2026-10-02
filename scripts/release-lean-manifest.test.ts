import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectLeanManifest, LEAN_CHECKS, parseLeanEvidence } from './release-lean-manifest';
import { writeReleaseManifest } from './release-manifest';

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));
const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const directories: string[] = [];
beforeEach(() => {
  vi.mocked(execFileSync).mockImplementation((_command, args) =>
    args?.includes('HEAD^{tree}') ? tree : args?.includes('HEAD') ? sha : '',
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

function index() {
  return {
    schemaVersion: 1,
    tree,
    evidence: LEAN_CHECKS.map((check) => ({
      check,
      file: `${check}.txt`,
      tree,
      sha256: digest(check),
      bytes: Buffer.byteLength(check),
      recordedAt: '2026-10-02T01:00:00.000Z',
      result: 'passed',
      ...(check === 'films-download' ? { attempt: 1 } : {}),
    })),
  };
}
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'lean-release-'));
  directories.push(directory);
  const root = path.join(directory, 'checkout');
  const evidence = path.join(directory, 'evidence');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(evidence);
  await writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(path.join(root, 'docs', 'intermittents.md'), 'Keep both FLAKE-01 attempts.\n');
  const input = path.join(evidence, 'index.json');
  const output = path.join(evidence, 'manifest.json');
  const data = index();
  await Promise.all(data.evidence.map((row) => writeFile(path.join(evidence, row.file), row.check)));
  await writeFile(input, JSON.stringify(data));
  return { root, evidence, input, output, data };
}
describe('lean release manifest', () => {
  it('requires every partition and rejects absent, stale or malformed provenance', () => {
    expect(parseLeanEvidence(index(), tree)).toHaveLength(LEAN_CHECKS.length);
    for (const check of LEAN_CHECKS) {
      const value = index();
      value.evidence = value.evidence.filter((row) => row.check !== check);
      expect(() => parseLeanEvidence(value, tree)).toThrow('Missing required lean evidence');
    }
    for (const change of [
      { tree: 'c'.repeat(40) },
      { tree: 'short' },
      { sha256: '' },
      { bytes: 0 },
      { bytes: 1.5 },
      { recordedAt: 'yesterday' },
      { recordedAt: '2026-02-30T01:00:00.000Z' },
      { result: 'failed' },
      { result: 'review-required' },
      { attempt: 1 },
      { check: 'waiver' },
    ]) {
      const value = index();
      Object.assign(value.evidence[0]!, change);
      expect(() => parseLeanEvidence(value, tree)).toThrow();
    }
    expect(() => parseLeanEvidence({ ...index(), tree: 'c'.repeat(40) }, tree)).toThrow('candidate tree');
  });
  it('keeps the single film failure visible and refuses a second failure or a missing first attempt', () => {
    const value = index();
    const film = value.evidence.find((row) => row.check === 'films-download')!;
    film.result = 'failed';
    expect(() => parseLeanEvidence(value, tree)).toThrow('both attempts');
    value.evidence.push({ ...film, file: 'film-rerun.txt', result: 'passed', attempt: 2 });
    expect(parseLeanEvidence(value, tree).filter((row) => row.check === 'films-download')).toHaveLength(2);
    value.evidence.at(-1)!.result = 'failed';
    expect(() => parseLeanEvidence(value, tree)).toThrow('one passing rerun');
    value.evidence.at(-1)!.result = 'passed';
    film.attempt = 2;
    expect(() => parseLeanEvidence(value, tree)).toThrow('only one failed attempt');
  });
  it('binds source, lockfile, intermittent register and every exact evidence file without requiring dist', async () => {
    const current = await fixture();
    await writeReleaseManifest(current.root, [current.output, '--lean', current.input]);
    const manifest = JSON.parse(await readFile(current.output, 'utf8')) as Awaited<
      ReturnType<typeof collectLeanManifest>
    >;
    expect(manifest.source).toEqual({ sha, tree });
    expect(manifest.fingerprints).toEqual([
      { path: 'package-lock.json', bytes: 22, sha256: digest('{"lockfileVersion":3}\n') },
      { path: 'docs/intermittents.md', bytes: 29, sha256: digest('Keep both FLAKE-01 attempts.\n') },
    ]);
    expect(manifest.evidence).toEqual(current.data.evidence);
    expect(manifest.evidenceIndex).toMatchObject({
      file: 'index.json',
      tree,
      sha256: digest(JSON.stringify(current.data)),
    });
    expect(manifest.reviewRequired).toBe(false);
    await expect(writeReleaseManifest(current.root, [current.output, '--lean', current.input])).rejects.toThrow(
      'EEXIST',
    );
  });
  it('fails missing or changed files, duplicate evidence and another-tree receipts', async () => {
    const current = await fixture();
    const first = current.data.evidence[0]!;
    await writeFile(path.join(current.evidence, first.file), 'different');
    await expect(collectLeanManifest(current.root, current.output, current.input)).rejects.toThrow('bytes changed');
    await rm(path.join(current.evidence, first.file));
    await expect(collectLeanManifest(current.root, current.output, current.input)).rejects.toThrow();
    await writeFile(path.join(current.evidence, first.file), first.check);
    current.data.evidence.push({ ...first });
    await writeFile(current.input, JSON.stringify(current.data));
    await expect(collectLeanManifest(current.root, current.output, current.input)).rejects.toThrow('exactly once');
    current.data.evidence.pop();
    first.tree = 'c'.repeat(40);
    await writeFile(current.input, JSON.stringify(current.data));
    await expect(collectLeanManifest(current.root, current.output, current.input)).rejects.toThrow('another tree');
  });
  it('records dependency review requirements without calling advisories clean', async () => {
    const current = await fixture();
    current.data.evidence.find((row) => row.check === 'npm-audit')!.result = 'review-required';
    await writeFile(current.input, JSON.stringify(current.data));
    expect((await collectLeanManifest(current.root, current.output, current.input)).reviewRequired).toBe(true);
  });
  it.each(['json', 'log'])('does not let an index overwrite a %s report tree', async (extension) => {
    const current = await fixture();
    const first = current.data.evidence[0]!;
    const content =
      extension === 'json' ? JSON.stringify({ source: { tree: 'c'.repeat(40) } }) : `tree: ${'c'.repeat(40)}\npassed\n`;
    first.file = `static.${extension}`;
    first.bytes = Buffer.byteLength(content);
    first.sha256 = digest(content);
    await writeFile(path.join(current.evidence, first.file), content);
    await writeFile(current.input, JSON.stringify(current.data));
    await expect(collectLeanManifest(current.root, current.output, current.input)).rejects.toThrow(
      'index cannot override',
    );
  });
  it('refuses dirty checkouts, in-checkout output and mixed command modes', async () => {
    const current = await fixture();
    await expect(
      collectLeanManifest(current.root, path.join(current.root, 'manifest.json'), current.input),
    ).rejects.toThrow('outside');
    await expect(
      writeReleaseManifest(current.root, [current.output, '--lean', current.input, '--allow-dirty']),
    ).rejects.toThrow('Usage');
    vi.mocked(execFileSync).mockImplementation((_command, args) =>
      args?.includes('HEAD^{tree}') ? tree : args?.includes('HEAD') ? sha : ' M README.md',
    );
    await expect(collectLeanManifest(current.root, current.output, current.input)).rejects.toThrow('clean committed');
  });
});
