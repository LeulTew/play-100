import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APB2_PROFILE_IDS,
  APB2_PROTOCOL,
  verifyProtocol,
  type Apb2ProfileId,
  type ProtocolVerification,
} from './release-apb2-contract';
import { APB2_V32_FREEZE_SHA256 } from './release-apb2-v32-files';

/**
 * The release:gate form of the runner: verify the pinned set, capture fine1440cpu1, then coarse393cpu4 with the fine
 * runtime as its previous runtime, collect both, and write `receipt.json` (`Apb2GateReceipt`, schema 1) bound to the
 * exact source commit and tree. `status` is `passed` only when both profiles are complete, recomputed equal and every
 * gated row passes. An operator who must interleave host admission between the profiles can run the same sequence in
 * steps (`--step fine1440cpu1`, `--step coarse393cpu4`, `--step receipt`) against one evidence folder.
 */
export const APB2_GATE_STEPS = ['all', 'fine1440cpu1', 'coarse393cpu4', 'receipt'] as const;
export type Apb2GateStep = (typeof APB2_GATE_STEPS)[number];
export const APB2_GATE_ENV = {
  commit: 'PLAY100_APB2_SOURCE_COMMIT',
  tree: 'PLAY100_APB2_SOURCE_TREE',
  quiet: 'PLAY100_APB2_QUIET_ATTESTED',
  browser: 'PLAY100_APB2_BROWSER_VERSION',
} as const;

export interface Apb2GateProfile {
  profile: Apb2ProfileId;
  stageId: string;
  result: string | null;
  complete: boolean;
  recomputed: boolean;
  gated: number;
  passed: number;
  allGatedPass: boolean;
  files: Record<'stage' | 'table' | 'records' | 'captureRun', { path: string; sha256: string } | null>;
}

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repository, '--no-optional-locks', '--no-pager', ...args], { encoding: 'utf8' }).trim();

/** The candidate identity the gate names: it must equal both the environment the gate set and this checkout's HEAD. */
export function gateSource(env: NodeJS.ProcessEnv, head: string, tree: string) {
  const sha = env[APB2_GATE_ENV.commit];
  const named = env[APB2_GATE_ENV.tree];
  assert.ok(sha && /^[0-9a-f]{40}$/.test(sha), `${APB2_GATE_ENV.commit} must name the full candidate commit.`);
  assert.ok(named && /^[0-9a-f]{40}$/.test(named), `${APB2_GATE_ENV.tree} must name the full candidate tree.`);
  assert.equal(sha, head, `${APB2_GATE_ENV.commit} is not this checkout's HEAD.`);
  assert.equal(named, tree, `${APB2_GATE_ENV.tree} is not this checkout's tree.`);
  return { sha, tree: named };
}

/** Exactly one quiet-host attestation from the operator; the runner never assumes it. */
export function quietAttested(env: NodeJS.ProcessEnv) {
  return env[APB2_GATE_ENV.quiet] === '1';
}

/** A stage id that never collides with an earlier capture of the same commit in the pinned folder. */
export function gateStageId(sha: string, token: string, profile: Apb2ProfileId) {
  assert.ok(
    /^[0-9a-f]{40}$/.test(sha) && /^\d{14}$/.test(token),
    'A gate stage id needs the commit and a 14-digit token.',
  );
  return `g${sha.slice(0, 8)}-${token}-${profile}`;
}

/** One profile's part of the receipt, read back from the stage's own evidence (missing files stay missing). */
export function gateProfile(
  profile: Apb2ProfileId,
  stageId: string,
  stage: {
    result?: string;
    collection?: { equal?: boolean; gated?: number; passed?: number; allGatedPass?: boolean };
  } | null,
  files: Apb2GateProfile['files'],
): Apb2GateProfile {
  const collection = stage?.collection;
  const complete = stage?.result === 'CAPTURE_COMPLETE_TABLE_RECOMPUTED';
  const gated = collection?.gated ?? 0;
  const passed = collection?.passed ?? 0;
  return {
    profile,
    stageId,
    result: stage?.result ?? null,
    complete,
    recomputed: collection?.equal === true,
    gated,
    passed,
    allGatedPass: complete && collection?.allGatedPass === true && gated > 0 && passed === gated,
    files,
  };
}

/**
 * The receipt the gate checks (`Apb2GateReceipt`): schema 1, the exact source, and `passed` only when both profiles are
 * complete, recomputed equal and every gated row passes, with every bound file present. `complete` is the same check
 * without the gated rows, so a failed receipt that is complete means a gated row did not pass and nothing else.
 */
export function gateReceipt(input: {
  source: { sha: string; tree: string };
  profiles: readonly Apb2GateProfile[];
  verification: Pick<ProtocolVerification, 'ok' | 'files' | 'freezeSha256'> | null;
  browserVersion: string;
  runner: Record<string, string>;
  failure?: string | null;
}) {
  const byProfile = new Map(input.profiles.map((profile) => [profile.profile, profile]));
  const reasons: string[] = [];
  let complete = true;
  const block = (reason: string) => {
    complete = false;
    reasons.push(reason);
  };
  if (!input.verification?.ok) block('The pinned set did not verify.');
  for (const id of APB2_PROFILE_IDS) {
    const row = byProfile.get(id);
    if (!row) block(`${id}: not run.`);
    else if (!row.complete) block(`${id}: incomplete (${row.result ?? 'no stage receipt'}).`);
    else if (!row.recomputed) block(`${id}: the recomputed table differs from the pinned aggregation.`);
    else if (!row.allGatedPass)
      reasons.push(`${id}: ${row.gated - row.passed} of ${row.gated} gated rows did not pass.`);
    if (row && Object.values(row.files).some((file) => file === null)) block(`${id}: a bound file is missing.`);
  }
  if (input.failure) block(input.failure);
  return {
    schemaVersion: 1 as const,
    source: input.source,
    status: reasons.length ? ('failed' as const) : ('passed' as const),
    complete,
    protocol: APB2_PROTOCOL,
    pinnedSet: input.verification
      ? {
          freezeSha256: input.verification.freezeSha256,
          files: input.verification.files,
          verified: input.verification.ok,
        }
      : null,
    browserVersion: input.browserVersion,
    runner: input.runner,
    profiles: APB2_PROFILE_IDS.map((id) => byProfile.get(id) ?? null),
    reasons,
  };
}
export type Apb2GateRun = ReturnType<typeof gateReceipt>;

/** One stage's exit code (the runner's usage): 0 complete and passing, 2 complete with a gated miss, 1 otherwise. */
export function stageExitCode(result: string | undefined, allGatedPass: boolean) {
  if (result !== 'CAPTURE_COMPLETE_TABLE_RECOMPUTED') return 1;
  return allGatedPass ? 0 : 2;
}

/** A gate receipt's exit code: 0 passed, 2 complete with a gated row not passing (and nothing else), 1 otherwise. */
export function gateExitCode(receipt: { status: string; complete: boolean }) {
  if (receipt.status === 'passed') return 0;
  return receipt.complete ? 2 : 1;
}

async function bind(file: string) {
  return existsSync(file) ? { path: file, sha256: sha256(await readFile(file)) } : null;
}

export interface GateOptions {
  evidence: string;
  protocol: string;
  dist: string;
  browserVersion: string;
  step: Apb2GateStep;
}

/**
 * Runs the gate sequence (or one step of it). The sequence stops at the first stage that does not complete: the coarse
 * stage needs a complete fine stage of the same gate. `all` and `receipt` write `receipt.json`; a profile step returns
 * its own stage's exit code.
 */
export async function runGate(options: GateOptions): Promise<{ receipt: Apb2GateRun | null; exitCode: number }> {
  const head = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const source = gateSource(process.env, head, tree);
  assert.ok(
    quietAttested(process.env),
    `Set ${APB2_GATE_ENV.quiet}=1 to attest the quiet host before the gate captures.`,
  );
  assert.ok(
    /^\d+\.\d+\.\d+\.\d+$/.test(options.browserVersion),
    `Name the bound Chrome with --browser-version or ${APB2_GATE_ENV.browser}.`,
  );
  const evidence = path.resolve(options.evidence);
  const statePath = path.join(evidence, 'gate.json');
  if (options.step === 'all' || options.step === 'fine1440cpu1') {
    await mkdir(evidence, { recursive: false });
    const now = new Date();
    const token = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const state = {
      schemaVersion: 1,
      source,
      token,
      protocol: APB2_PROTOCOL,
      pinnedFreezeSha256: APB2_V32_FREEZE_SHA256,
      browserVersion: options.browserVersion,
      dist: path.resolve(options.dist),
      startedAt: now.toISOString(),
    };
    await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
  }
  const state = JSON.parse(await readFile(statePath, 'utf8')) as {
    source: { sha: string; tree: string };
    token: string;
    browserVersion: string;
    dist: string;
  };
  assert.deepEqual(state.source, source, 'This evidence folder belongs to another source.');
  assert.equal(state.browserVersion, options.browserVersion, 'The gate steps must bind one Chrome version.');
  assert.equal(state.dist, path.resolve(options.dist), 'The gate steps must use one build.');
  const stageIds = Object.fromEntries(
    APB2_PROFILE_IDS.map((id) => [id, gateStageId(source.sha, state.token, id)]),
  ) as Record<Apb2ProfileId, string>;
  const stageReceiptPath = (id: Apb2ProfileId) => path.join(evidence, stageIds[id], 'stage.json');
  const readStage = async (id: Apb2ProfileId) =>
    existsSync(stageReceiptPath(id))
      ? (JSON.parse(await readFile(stageReceiptPath(id), 'utf8')) as NonNullable<Parameters<typeof gateProfile>[2]>)
      : null;
  const { runApb2Stage, runnerIdentity } = await import('./release-apb2-stage');
  let verification: ProtocolVerification | null = null;
  let failure: string | null = null;
  let exitCode = 1;
  const stage = async (profile: Apb2ProfileId) => {
    let previousRuntime: string | undefined;
    if (profile === 'coarse393cpu4') {
      const fine = await readStage('fine1440cpu1');
      assert.equal(
        fine?.result,
        'CAPTURE_COMPLETE_TABLE_RECOMPUTED',
        'The coarse stage needs a complete fine stage of this gate.',
      );
      previousRuntime = path.join(options.protocol, 'round4-apb2', stageIds.fine1440cpu1, 'runtime.json');
      assert.ok(existsSync(previousRuntime), "The fine stage's runtime is missing.");
    }
    const receipt = await runApb2Stage({
      protocol: options.protocol,
      dist: options.dist,
      evidence,
      profile,
      stageId: stageIds[profile],
      browserVersion: options.browserVersion,
      quietAttested: true,
      smoke: false,
      previousRuntime,
    });
    const collection = receipt.collection as { allGatedPass?: boolean } | undefined;
    exitCode = stageExitCode(receipt.result as string | undefined, collection?.allGatedPass === true);
    return receipt.result === 'CAPTURE_COMPLETE_TABLE_RECOMPUTED';
  };
  try {
    verification = await verifyProtocol(options.protocol);
    assert.ok(verification.ok, 'The pinned APB2 v3.2 set differs from the committed digests.');
    if (options.step === 'all') {
      if (await stage('fine1440cpu1')) await stage('coarse393cpu4');
    } else if (options.step !== 'receipt') await stage(options.step);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  if (options.step !== 'all' && options.step !== 'receipt') {
    if (failure) throw new Error(failure);
    return { receipt: null, exitCode };
  }
  const profiles: Apb2GateProfile[] = [];
  for (const id of APB2_PROFILE_IDS) {
    const folder = path.join(evidence, stageIds[id]);
    const stageValue = await readStage(id);
    if (!stageValue && !existsSync(folder)) continue;
    profiles.push(
      gateProfile(id, stageIds[id], stageValue, {
        stage: await bind(stageReceiptPath(id)),
        table: await bind(path.join(folder, 'table.json')),
        records: await bind(path.join(folder, 'repetitions', 'index.json')),
        captureRun: await bind(path.join(options.protocol, 'round4-apb2', stageIds[id], 'capture', 'run.json')),
      }),
    );
  }
  const receipt = gateReceipt({
    source,
    profiles,
    verification: verification ?? (await verifyProtocol(options.protocol)),
    browserVersion: options.browserVersion,
    runner: await runnerIdentity(),
    failure,
  });
  await writeFile(path.join(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return { receipt, exitCode: gateExitCode(receipt) };
}
