import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { APB2_V32_FILES, APB2_V32_FREEZE_SHA256 } from './release-apb2-v32-files';

/** The frozen APB2 v3.2 contract the committed runner checks the pinned measurement set against. */
export const APB2_PROTOCOL = 'APB2 v3.2';
export const APB2_PROTOCOL_ID = 'play100-apb2-absolute-v1';
export const APB2_PROTOCOL_JSON_SHA256 = '5c6a9739a0b7c464af44f2ca4850fe149c2577bd30a860aa0ee84dfd0c9045df';
export const APB2_ORIGIN = 'http://127.0.0.1:4199';
export const APB2_PORT = 4199;
export const APB2_REPETITIONS = 8;
export const APB2_CONTEXTS_PER_STAGE = 72;
export const APB2_ACTION_WINDOWS_PER_STAGE = 104;
export const APB2_STAGE_MINUTES = 19;
export const APB2_PROTOCOL_ENV = 'PLAY100_APB2_PROTOCOL';

export const APB2_PROFILES = [
  {
    id: 'fine1440cpu1',
    viewport: { width: 1440, height: 900 },
    dpr: 1,
    mobile: false,
    touch: false,
    cpuRate: 1,
    motion: 'auto',
    reducedMotion: false,
  },
  {
    id: 'coarse393cpu4',
    viewport: { width: 393, height: 851 },
    dpr: 1,
    mobile: true,
    touch: true,
    cpuRate: 4,
    motion: 'auto',
    reducedMotion: false,
  },
] as const;
export type Apb2ProfileId = (typeof APB2_PROFILES)[number]['id'];
export const APB2_PROFILE_IDS: readonly Apb2ProfileId[] = APB2_PROFILES.map((profile) => profile.id);

/** Returning journeys, in block order; every block starts with the static control and the first visit. */
export const APB2_JOURNEYS_IN_ORDER = [
  'dense500-library',
  'collection-title',
  'discover-title',
  'menu',
  'queue',
  'ready-account',
  'ordinary-pin',
] as const;
export type Apb2Journey = 'static-control' | 'first-visit' | (typeof APB2_JOURNEYS_IN_ORDER)[number];
export type Apb2Kind = 'static-control' | 'first-visit' | 'returning';
export const APB2_BLOCK: readonly { journey: Apb2Journey; kind: Apb2Kind }[] = [
  { journey: 'static-control', kind: 'static-control' },
  { journey: 'first-visit', kind: 'first-visit' },
  ...APB2_JOURNEYS_IN_ORDER.map((journey) => ({ journey, kind: 'returning' as const })),
];

export interface Budget {
  p75: number;
  cap: number;
}
export type BudgetKey =
  'inputResponseMs' | 'semanticReadyMs' | 'longestLoafMs' | 'startupPolicyDefaultMs' | 'startupPolicyDenseMs';
export const APB2_BUDGETS: Record<Apb2ProfileId, Record<BudgetKey, Budget>> = {
  fine1440cpu1: {
    inputResponseMs: { p75: 100, cap: 200 },
    semanticReadyMs: { p75: 400, cap: 800 },
    longestLoafMs: { p75: 100, cap: 200 },
    startupPolicyDefaultMs: { p75: 500, cap: 1000 },
    startupPolicyDenseMs: { p75: 500, cap: 1000 },
  },
  coarse393cpu4: {
    inputResponseMs: { p75: 200, cap: 400 },
    semanticReadyMs: { p75: 600, cap: 1200 },
    longestLoafMs: { p75: 200, cap: 400 },
    startupPolicyDefaultMs: { p75: 1000, cap: 2000 },
    startupPolicyDenseMs: { p75: 1500, cap: 3000 },
  },
};

export type GatedMetric = 'inputResponse' | 'semanticReadyMs' | 'longestLoafMs' | 'startupPolicyMs';
export type InformationalMetric = 'fcpMs' | 'lcpAtBoundaryMs' | 'firstPaintMs' | 'firstPaintMinusDclMs';

/** The gated metrics of a block entry, in the frozen aggregation's order. */
export function gatedMetrics(kind: Apb2Kind): GatedMetric[] {
  if (kind === 'returning') return ['inputResponse', 'semanticReadyMs', 'longestLoafMs', 'startupPolicyMs'];
  return kind === 'first-visit' ? ['startupPolicyMs'] : [];
}

/** The informational paint metrics of a block entry, in the frozen aggregation's order. */
export function informationalMetrics(kind: Apb2Kind): InformationalMetric[] {
  if (kind === 'first-visit') return ['fcpMs', 'lcpAtBoundaryMs'];
  return kind === 'static-control' ? ['firstPaintMs', 'fcpMs', 'lcpAtBoundaryMs', 'firstPaintMinusDclMs'] : [];
}

/** The budget a gated metric is held to; startup uses the dense budget only for the dense-500 fixture. */
export function budgetFor(profile: Apb2ProfileId, metric: GatedMetric, journey: Apb2Journey): Budget {
  const key: BudgetKey =
    metric === 'startupPolicyMs'
      ? journey === 'dense500-library'
        ? 'startupPolicyDenseMs'
        : 'startupPolicyDefaultMs'
      : metric === 'inputResponse'
        ? 'inputResponseMs'
        : metric;
  return APB2_BUDGETS[profile][key];
}

/** The fixed schedule of one profile: eight blocks of nine contexts, ordinal = repetition * 9 + position. */
export function apb2Schedule(profile: Apb2ProfileId) {
  return Array.from({ length: APB2_REPETITIONS }, (_, repetition) =>
    APB2_BLOCK.map((entry, index) => ({
      ...entry,
      profile,
      repetition,
      ordinal: repetition * APB2_BLOCK.length + index,
    })),
  ).flat();
}

export interface PinnedConfiguration {
  apb: {
    id: string;
    profiles: readonly unknown[];
    budgets: Record<string, Record<string, Budget>>;
    journeysInOrder: readonly string[];
  };
}

/** Differences between the pinned protocol's own configuration and this committed contract (empty when they agree). */
export function contractDifferences(config: PinnedConfiguration): string[] {
  const differences: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (config.apb.id !== APB2_PROTOCOL_ID) differences.push(`protocol id ${config.apb.id}`);
  if (!same(config.apb.journeysInOrder, APB2_JOURNEYS_IN_ORDER)) differences.push('journey order');
  for (const profile of APB2_PROFILES) {
    const pinned = config.apb.profiles.find((value) => (value as { id?: string }).id === profile.id);
    if (!same(pinned, profile)) differences.push(`profile ${profile.id}`);
    for (const key of Object.keys(APB2_BUDGETS[profile.id]) as BudgetKey[]) {
      if (!same(config.apb.budgets[profile.id]?.[key], APB2_BUDGETS[profile.id][key])) {
        differences.push(`budget ${profile.id} ${key}`);
      }
    }
  }
  if (config.apb.profiles.length !== APB2_PROFILES.length) differences.push('profile count');
  return differences;
}

export interface ProtocolVerification {
  root: string;
  freezeSha256: string;
  files: number;
  missing: string[];
  changed: string[];
  links: string[];
  extra: string[];
  ok: boolean;
}

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** Checks every pinned file under `root` by SHA-256. Extra files (earlier captures) are listed, never loaded. */
export async function verifyProtocol(
  root: string,
  files: readonly (readonly [string, string])[] = APB2_V32_FILES,
): Promise<ProtocolVerification> {
  const missing: string[] = [];
  const changed: string[] = [];
  const links: string[] = [];
  for (const [relative, expected] of files) {
    const file = path.join(root, ...relative.split('/'));
    let info;
    try {
      info = await lstat(file);
    } catch {
      missing.push(relative);
      continue;
    }
    if (info.isSymbolicLink() || !info.isFile()) {
      links.push(relative);
      continue;
    }
    if (sha256(await readFile(file)) !== expected) changed.push(relative);
  }
  const listed = new Set(files.map(([relative]) => relative));
  const extra: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (entry.isSymbolicLink()) links.push(relative);
      else if (entry.isDirectory()) await walk(full);
      else if (!listed.has(relative)) extra.push(relative);
    }
  };
  try {
    await walk(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return {
    root,
    freezeSha256: APB2_V32_FREEZE_SHA256,
    files: files.length,
    missing,
    changed,
    links,
    extra,
    ok: missing.length === 0 && changed.length === 0 && links.length === 0,
  };
}

/** The protocol folder, named only by --protocol or PLAY100_APB2_PROTOCOL. */
export function protocolRoot(argument: string | undefined, env: NodeJS.ProcessEnv = process.env): string {
  const value = argument ?? env[APB2_PROTOCOL_ENV];
  if (!value?.trim()) throw new Error(`Name the pinned APB2 v3.2 folder with --protocol or ${APB2_PROTOCOL_ENV}.`);
  return path.resolve(value);
}

/** The single module entry the built index.html loads. */
export function moduleEntry(indexHtml: string) {
  const entries = [
    ...new Set(
      [...indexHtml.matchAll(/<script type="module"[^>]*\ssrc="(\/assets\/index-[^"]+\.js)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  assert.equal(entries.length, 1, 'The build index must load exactly one module entry.');
  return entries[0] as string;
}

/** The product IndexedDB version the guest fixture opens at (APB2 v3.2): the committed DB_VERSION, never a literal. */
export function fixtureDbVersion(personalDbSource: string) {
  const lines = personalDbSource
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^export const DB_VERSION = /.test(line));
  assert.equal(lines.length, 1, 'personal-db.ts must declare DB_VERSION once.');
  const match = /^export const DB_VERSION = (\d+);$/.exec(lines[0] as string);
  assert.ok(match, 'DB_VERSION must be an integer literal.');
  const version = Number(match[1]);
  assert.ok(Number.isSafeInteger(version) && version > 0);
  return version;
}
