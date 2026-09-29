import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { requireObject, requireText } from '../src/lib/guards';

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const digest = (value: unknown) => {
  const text = requireText(value);
  assert.match(text, /^[a-f0-9]{64}$/i, 'Expected a SHA-256 digest.');
  return text.toLowerCase();
};

export interface SwBuildInput {
  receipt: string;
  receiptSha256: string;
  vercel: string;
  vercelSha256: string;
  commit: string;
}

export function parseSwArguments(args: string[]) {
  assert.equal(args.length, 2, 'Use release:sw-probe -- --input FILE (fresh evidence only).');
  assert.equal(args[0], '--input', 'Use --input FILE.');
  return path.resolve(args[1]);
}

export function parseSwInput(value: unknown, directory: string) {
  const input = requireObject(value);
  assert.equal(input.version, 1, 'Unsupported SW probe input version.');
  const build = (value: unknown): SwBuildInput => {
    const row = requireObject(value);
    const commit = requireText(row.commit);
    assert.match(commit, /^[a-f0-9]{40}$/, 'Use full immutable commit IDs.');
    return {
      receipt: path.resolve(directory, requireText(row.receipt)),
      receiptSha256: digest(row.receiptSha256),
      vercel: path.resolve(directory, requireText(row.vercel)),
      vercelSha256: digest(row.vercelSha256),
      commit,
    };
  };
  const port = input.port;
  assert.ok(
    typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535,
    'Invalid loopback port.',
  );
  const baseline = build(input.baseline),
    candidate = build(input.candidate);
  assert.notEqual(baseline.commit, candidate.commit, 'Two different build commits are required.');
  return { baseline, candidate, port, evidence: path.resolve(directory, requireText(input.evidence)) };
}

export async function verifiedJson(file: string, expected: string): Promise<unknown> {
  assert.ok((await lstat(file)).isFile(), `Not a regular evidence file: ${file}`);
  const bytes = await readFile(file);
  assert.equal(sha(bytes), expected, `Evidence digest mismatch: ${file}`);
  return JSON.parse(bytes.toString('utf8'));
}

export async function buildInventory(directory: string) {
  assert.ok((await lstat(directory)).isDirectory(), 'A build root must be a real directory, not a link.');
  const rows: { File: string; SHA256: string }[] = [];
  async function walk(dir: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) rows.push({ File: path.relative(directory, full), SHA256: sha(await readFile(full)) });
      else throw new Error(`Build evidence may not contain links or special files: ${full}`);
    }
  }
  await walk(directory);
  return { rows, fingerprint: sha(rows.map((row) => `${row.File}:${row.SHA256}`).join('\n')) };
}

export async function verifySwBuild(input: SwBuildInput, candidate: boolean, repository: string) {
  const receipt = requireObject(await verifiedJson(input.receipt, input.receiptSha256));
  assert.equal(receipt.Passed, true, 'Build receipt did not pass.');
  assert.equal(receipt.Source, input.commit, 'Build receipt has the wrong source.');
  const build = requireObject(receipt.Build),
    archive = requireObject(build.Archive);
  const base = path.dirname(input.receipt);
  const root = path.resolve(base, requireText(archive.Root));
  const manifestFile = path.resolve(base, requireText(archive.Path));
  const manifest = requireObject(await verifiedJson(manifestFile, digest(archive.SHA256)));
  assert.ok(Array.isArray(manifest.Files) && manifest.Files.length > 0, 'Build manifest is empty.');
  const expected = new Map<string, string>();
  for (const value of manifest.Files) {
    const row = requireObject(value),
      file = requireText(row.File);
    const normalized = file.replaceAll('\\', '/');
    assert.ok(
      !path.isAbsolute(file) && !normalized.split('/').some((part) => !part || part === '.' || part === '..'),
      'Unsafe archive entry.',
    );
    assert.ok(!expected.has(normalized), 'Duplicate archive entry.');
    expected.set(normalized, digest(row.SHA256));
  }
  const actual = await buildInventory(root);
  assert.equal(actual.rows.length, expected.size, 'Build inventory has missing or extra files.');
  for (const row of actual.rows)
    assert.equal(row.SHA256, expected.get(row.File.replaceAll('\\', '/')), `Build file changed: ${row.File}`);
  const configuration = requireObject(await verifiedJson(input.vercel, input.vercelSha256));
  const sourceConfig = execFileSync('git', ['-C', repository, 'show', `${input.commit}:vercel.json`]);
  assert.equal(sha(sourceConfig), input.vercelSha256, 'Deployment policy does not belong to the bound commit.');
  assert.ok(Array.isArray(configuration.headers), 'Missing deployment headers.');
  // The baseline can predate the exact auth-helper exclusion. Identify its main rule by its root match.
  const main = configuration.headers
    .map((value) => requireObject(value))
    .filter((rule) => new RegExp(`^${requireText(rule.source)}$`).test('/'));
  assert.equal(main.length, 1, 'Expected exactly one root-document header rule.');
  assert.ok(Array.isArray(main[0].headers), 'Missing root headers.');
  const headers = Object.fromEntries(
    main[0].headers.map((value) => {
      const row = requireObject(value);
      return [requireText(row.key).toLowerCase(), requireText(row.value)];
    }),
  );
  assert.ok(headers['content-security-policy'] && headers['permissions-policy'], 'Missing document policies.');
  const index = await readFile(path.join(root, 'index.html'));
  const sw = await readFile(path.join(root, 'sw.js'));
  const assets = await readFile(path.join(root, 'pwa-assets.json'));
  const pwaVersion = requireText(requireObject(JSON.parse(assets.toString())).version);
  const entry = index.toString().match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
  assert.ok(entry, 'No module entry found in the built document.');
  if (candidate) {
    assert.equal(receipt.Status, 'CONFIGURED_BUILD_PASSED');
    const gate = requireObject(receipt.Gate);
    assert.equal(
      requireObject(gate.ConfiguredIdentity).fingerprint,
      actual.fingerprint,
      'Candidate differs from the gated configured build.',
    );
    assert.equal(requireObject(receipt.Fingerprints).Archive, actual.fingerprint);
    assert.equal(build.IndexHtml, sha(index));
    assert.equal(build.SwJs, sha(sw));
    assert.equal(build.PwaVersion, pwaVersion);
  }
  return {
    ...input,
    root,
    manifestFile,
    manifestSha256: digest(archive.SHA256),
    fingerprint: actual.fingerprint,
    files: actual.rows.length,
    configuration,
    indexSha256: sha(index),
    swSha256: sha(sw),
    assetsSha256: sha(assets),
    pwaVersion,
    entry,
    csp: headers['content-security-policy'],
    permissionsPolicy: headers['permissions-policy'],
  };
}

export type SwBuild = Awaited<ReturnType<typeof verifySwBuild>>;
