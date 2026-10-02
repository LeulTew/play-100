import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exitCode, parseApb2Arguments } from './release-apb2';
import {
  gateExitCode,
  gateProfile,
  gateReceipt,
  gateSource,
  gateStageId,
  quietAttested,
  stageExitCode,
  type Apb2GateProfile,
} from './release-apb2-gate';
import { closureErrors, settleClosure, stageResult } from './release-apb2-outcome';
import { apb2StepEnvironment, checkApb2GateReceipt } from './release-gate';
import {
  APB2_BUDGETS,
  APB2_GATED_ROWS,
  APB2_JOURNEYS_IN_ORDER,
  APB2_PROFILES,
  apb2Schedule,
  budgetFor,
  contractDifferences,
  fixtureDbVersion,
  gatedMetrics,
  informationalMetrics,
  moduleEntry,
  protocolRoot,
  verifyProtocol,
} from './release-apb2-contract';
import {
  compareRows,
  recomputeRows,
  recordName,
  repetitionRecords,
  summarizeTable,
  writeRepetitionRecords,
  type CapturedSample,
} from './release-apb2-records';
import {
  absoluteBudget,
  belowThreshold,
  finite,
  formatMeasurement,
  inputBudget,
  maximumMeasurement,
  orderStatistic,
  type Measurement,
} from './release-apb2-stats';
import { APB2_V32_FILES, APB2_V32_FREEZE_SHA256 } from './release-apb2-v32-files';

const temporary: string[] = [];
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function scratch() {
  const dir = await mkdtemp(path.join(tmpdir(), 'release-apb2-'));
  temporary.push(dir);
  return dir;
}
const members = <T>(values: T[], failed: number[] = []) =>
  values.map((value, repetition) => ({ repetition, present: true, failed: failed.includes(repetition), value }));

describe('APB2 contract', () => {
  it('keeps the two frozen profiles, the journey order and the inherited budgets', () => {
    expect(
      APB2_PROFILES.map((profile) => [
        profile.id,
        profile.viewport.width,
        profile.viewport.height,
        profile.cpuRate,
        profile.touch,
      ]),
    ).toEqual([
      ['fine1440cpu1', 1440, 900, 1, false],
      ['coarse393cpu4', 393, 851, 4, true],
    ]);
    expect(APB2_JOURNEYS_IN_ORDER).toEqual([
      'dense500-library',
      'collection-title',
      'discover-title',
      'menu',
      'queue',
      'ready-account',
      'ordinary-pin',
    ]);
    expect(APB2_BUDGETS.fine1440cpu1.inputResponseMs).toEqual({ p75: 100, cap: 200 });
    expect(APB2_BUDGETS.coarse393cpu4.startupPolicyDenseMs).toEqual({ p75: 1500, cap: 3000 });
    expect(budgetFor('coarse393cpu4', 'startupPolicyMs', 'dense500-library')).toEqual({ p75: 1500, cap: 3000 });
    expect(budgetFor('coarse393cpu4', 'startupPolicyMs', 'menu')).toEqual({ p75: 1000, cap: 2000 });
    expect(budgetFor('fine1440cpu1', 'inputResponse', 'queue')).toEqual({ p75: 100, cap: 200 });
  });

  it('schedules eight blocks of nine contexts with 29 gated and 6 informational rows per profile', () => {
    const schedule = apb2Schedule('fine1440cpu1');
    expect(schedule).toHaveLength(72);
    expect(schedule.slice(0, 9).map((entry) => entry.journey)).toEqual([
      'static-control',
      'first-visit',
      ...APB2_JOURNEYS_IN_ORDER,
    ]);
    expect(schedule.map((entry) => entry.ordinal)).toEqual(Array.from({ length: 72 }, (_, index) => index));
    const firstBlock = schedule.filter((entry) => entry.repetition === 0);
    expect(firstBlock.flatMap((entry) => gatedMetrics(entry.kind))).toHaveLength(29);
    expect(firstBlock.flatMap((entry) => informationalMetrics(entry.kind))).toHaveLength(6);
    expect(APB2_GATED_ROWS).toBe(29);
  });

  it('reports every difference between the pinned configuration and the committed contract', () => {
    const config = {
      apb: {
        id: 'play100-apb2-absolute-v1',
        profiles: APB2_PROFILES.map((profile) => structuredClone(profile)),
        budgets: structuredClone(APB2_BUDGETS),
        journeysInOrder: [...APB2_JOURNEYS_IN_ORDER],
      },
    };
    expect(contractDifferences(config)).toEqual([]);
    config.apb.budgets.coarse393cpu4.semanticReadyMs = { p75: 601, cap: 1200 };
    config.apb.journeysInOrder.reverse();
    expect(contractDifferences(config)).toEqual(['journey order', 'budget coarse393cpu4 semanticReadyMs']);
  });

  it('pins 145 distinct files by SHA-256 and verifies a folder against them', async () => {
    expect(APB2_V32_FILES).toHaveLength(145);
    expect(new Set(APB2_V32_FILES.map(([file]) => file)).size).toBe(145);
    expect(
      APB2_V32_FILES.every(
        ([file, digest]) => !file.includes('\\') && !path.isAbsolute(file) && /^[a-f0-9]{64}$/.test(digest),
      ),
    ).toBe(true);
    expect(APB2_V32_FREEZE_SHA256).toMatch(/^[a-f0-9]{64}$/);
    const root = await scratch();
    await mkdir(path.join(root, 'round4-apb2'));
    await writeFile(path.join(root, 'round4-apb2', 'adapter.mjs'), 'export {};\n');
    await writeFile(path.join(root, 'protocol.json'), '{}\n');
    const files = [
      ['round4-apb2/adapter.mjs', sha('export {};\n')],
      ['protocol.json', sha('{}\n')],
    ] as const;
    expect(await verifyProtocol(root, files)).toMatchObject({ ok: true, missing: [], changed: [], extra: [] });
    await writeFile(path.join(root, 'protocol.json'), '{"changed":true}\n');
    await mkdir(path.join(root, 'round4-apb2', 'r24-b-fine1440cpu1'));
    await writeFile(path.join(root, 'round4-apb2', 'r24-b-fine1440cpu1', 'run.json'), '{}\n');
    expect(await verifyProtocol(root, [...files, ['missing.mjs', sha('')]])).toMatchObject({
      ok: false,
      missing: ['missing.mjs'],
      changed: ['protocol.json'],
      extra: ['round4-apb2/r24-b-fine1440cpu1/run.json'],
    });
  });

  it('names the protocol folder only by argument or PLAY100_APB2_PROTOCOL', () => {
    expect(protocolRoot('C:\\pinned', { PLAY100_APB2_PROTOCOL: 'C:\\other' })).toBe(path.resolve('C:\\pinned'));
    expect(protocolRoot(undefined, { PLAY100_APB2_PROTOCOL: 'C:\\other' })).toBe(path.resolve('C:\\other'));
    expect(() => protocolRoot(undefined, {})).toThrow(/--protocol or PLAY100_APB2_PROTOCOL/);
  });
});

describe('APB2 statistics', () => {
  it('takes the sixth of eight as p75 and passes only within both p75 and cap', () => {
    const budget = { p75: 400, cap: 800 };
    const pass = absoluteBudget(members([10, 80, 20, 70, 30, 60, 40, 50]), budget);
    expect(pass).toMatchObject({ status: 'PASS_OBSERVED_ABSOLUTE_BUDGET', p75: 60, max: 80, finiteCount: 8 });
    expect(absoluteBudget(members([500, 500, 500, 500, 500, 500, 10, 10]), budget)).toMatchObject({
      status: 'FAIL_OBSERVED_BUDGET',
      p75: 500,
    });
    expect(absoluteBudget(members([10, 10, 10, 10, 10, 10, 10, 801]), budget)).toMatchObject({
      status: 'FAIL_OBSERVED_BUDGET',
      max: 801,
    });
    expect(absoluteBudget(members([10, 10, 10, 10, 10, 10, 10, null]), budget)).toMatchObject({
      status: 'UNKNOWN',
      p75: null,
      max: 10,
    });
    expect(absoluteBudget(members([10, 10, 10, 10, 10, 10, 10, 10], [3]), budget)).toMatchObject({
      status: 'FAIL_FAILED_RUN_CAP',
      failedRepetitions: [3],
    });
    expect(absoluteBudget(members([10, 10, 10, 10, 10, 10, 10]), budget).status).toBe('UNKNOWN');
  });

  it('carries the Event Timing "<16" bound instead of a fabricated zero', () => {
    const below = belowThreshold();
    expect(maximumMeasurement([below, below])).toEqual(below);
    expect(maximumMeasurement([below, finite(8)])).toEqual(below);
    expect(maximumMeasurement([below, finite(24)])).toEqual(finite(24));
    expect(maximumMeasurement([finite(8), { kind: 'UNKNOWN', reason: 'x' }]).kind).toBe('UNKNOWN');
    expect(orderStatistic([below, below, below, below, below, below, below, below], 5)).toEqual(below);
    expect(
      orderStatistic([finite(16), finite(16), finite(16), finite(16), finite(16), finite(16), below, below], 5),
    ).toEqual(finite(16));
    expect(orderStatistic([below, below, below, below, below, below, finite(8), finite(40)], 5)).toEqual(below);
    expect(orderStatistic([below, below, below, below, below, finite(8), finite(40), finite(40)], 5)).toEqual(below);
    expect(orderStatistic([below, below, finite(1), finite(2), finite(3), finite(4), finite(5), finite(6)], 5)).toEqual(
      {
        kind: 'BOUNDED',
        lowerInclusiveMs: 4,
        upperMs: 6,
        upperExclusive: false,
      },
    );
    expect(
      [finite(12.25), below, { kind: 'BOUNDED', lowerInclusiveMs: 8, upperMs: 16, upperExclusive: true } as const].map(
        formatMeasurement,
      ),
    ).toEqual(['12.3', '<16', '[8, 16)']);
  });

  it('judges input response by its interval bounds, any finite cap breach and failed runs', () => {
    const budget = { p75: 100, cap: 200 };
    const below = belowThreshold();
    expect(inputBudget(members<Measurement | null>(Array.from({ length: 8 }, () => below)), budget)).toMatchObject({
      status: 'PASS_OBSERVED_ABSOLUTE_BUDGET',
      p75Display: '<16',
      maxDisplay: '<16',
      belowThresholdCount: 8,
    });
    expect(
      inputBudget(members<Measurement | null>([...Array.from({ length: 7 }, () => finite(32)), finite(201)]), budget)
        .status,
    ).toBe('FAIL_OBSERVED_BUDGET');
    expect(
      inputBudget(members<Measurement | null>([...Array.from({ length: 7 }, () => finite(32)), null]), budget),
    ).toMatchObject({
      status: 'UNKNOWN',
      unknownRepetitions: [7],
    });
    expect(
      inputBudget(
        members<Measurement | null>(
          Array.from({ length: 8 }, () => finite(32)),
          [0],
        ),
        budget,
      ).status,
    ).toBe('FAIL_FAILED_RUN_CAP');
  });
});

const sample = (
  journey: string,
  repetition: number,
  values: Record<string, unknown>,
  extra: Partial<CapturedSample> = {},
): CapturedSample => ({
  journey,
  repetition,
  commit: 'a'.repeat(40),
  status: 'OBSERVED_SCOPED_CURRENT_SAMPLE',
  apbFailedRun: false,
  profile: { id: 'fine1440cpu1' },
  apb2HintFixture: { status: 'CONFIRMED' },
  apb2Values: values,
  ...extra,
});
function population() {
  return apb2Schedule('fine1440cpu1').map((entry) => ({
    file: `${entry.ordinal}.json`,
    sha256: sha(String(entry.ordinal)),
    sample: sample(
      entry.journey,
      entry.repetition,
      entry.kind === 'returning'
        ? {
            inputResponse: finite(16 + entry.repetition),
            semanticReadyMs: 20 + entry.repetition,
            longestLoafMs: 0,
            startupPolicyMs: 90,
          }
        : {
            startupPolicyMs: entry.kind === 'first-visit' ? 200 : null,
            fcpMs: 64,
            lcpAtBoundaryMs: 64,
            firstPaintMs: 64,
            firstPaintMinusDclMs: -2,
          },
    ),
  }));
}

describe('APB2 per-repetition records', () => {
  it('records every scheduled context once, keeping missing and unknown-fixture repetitions visible', () => {
    const samples = population().filter((item) => !(item.sample.journey === 'menu' && item.sample.repetition === 7));
    const queue = samples.find((item) => item.sample.journey === 'queue' && item.sample.repetition === 2);
    if (queue) queue.sample = { ...queue.sample, status: 'STOPPED', apb2HintFixture: { status: 'UNKNOWN' } };
    const records = repetitionRecords('fine1440cpu1', samples);
    expect(records).toHaveLength(72);
    expect(records.find((record) => record.journey === 'menu' && record.repetition === 7)).toMatchObject({
      present: false,
      failed: false,
      source: null,
    });
    expect(records.find((record) => record.journey === 'queue' && record.repetition === 2)).toMatchObject({
      present: true,
      fixtureUnknown: true,
      originalRunFailed: true,
      failed: false,
    });
    expect(() => repetitionRecords('fine1440cpu1', [...samples, samples[0] as (typeof samples)[number]])).toThrow(
      /Duplicate repetition/,
    );
    expect(() => repetitionRecords('coarse393cpu4', samples)).toThrow(/another profile/);
  });

  it('writes each record once with an index of SHA-256 digests', async () => {
    const directory = path.join(await scratch(), 'repetitions');
    const records = repetitionRecords('fine1440cpu1', population());
    const index = await writeRepetitionRecords(directory, records);
    expect(index).toMatchObject({ protocol: 'APB2 v3.2', records: 72, present: 72 });
    const first = records[0] as (typeof records)[number];
    expect(recordName(first)).toBe('00-static-control-fine1440cpu1-r0.json');
    const bytes = await readFile(path.join(directory, recordName(first)));
    expect(index.files[0]).toEqual({ file: recordName(first), sha256: sha(bytes), present: true });
    expect((await readdir(directory)).length).toBe(73);
    await expect(writeRepetitionRecords(directory, records)).rejects.toThrow();
  });

  it('recomputes the table rows in the frozen order and reports any disagreement', () => {
    const records = repetitionRecords('fine1440cpu1', population());
    const rows = recomputeRows('fine1440cpu1', records);
    expect(rows).toHaveLength(35);
    expect(
      rows.filter((row) => !row.informational).every((row) => row.status === 'PASS_OBSERVED_ABSOLUTE_BUDGET'),
    ).toBe(true);
    expect(rows.find((row) => row.journey === 'collection-title' && row.metric === 'inputResponse')).toMatchObject({
      p75: finite(21),
      max: finite(23),
    });
    expect(rows.find((row) => row.journey === 'static-control' && row.metric === 'firstPaintMinusDclMs')).toMatchObject(
      { p75: -2, max: -2, finiteCount: 8 },
    );
    const frozen: Record<string, unknown>[] = rows.map((row) => ({ ...row }));
    expect(compareRows(frozen, rows)).toEqual([]);
    expect([rows[4]?.journey, rows[4]?.metric, rows[6]?.metric]).toEqual([
      'first-visit',
      'startupPolicyMs',
      'lcpAtBoundaryMs',
    ]);
    (frozen[4] as Record<string, unknown>).status = 'FAIL_OBSERVED_BUDGET';
    (frozen[6] as Record<string, unknown>).p75 = 999;
    expect(compareRows(frozen, rows)).toEqual([
      'fine1440cpu1 first-visit startupPolicyMs: status FAIL_OBSERVED_BUDGET != PASS_OBSERVED_ABSOLUTE_BUDGET',
      'fine1440cpu1 first-visit lcpAtBoundaryMs: p75',
    ]);
    expect(compareRows(frozen.slice(1), rows)[0]).toBe('row count 34 != 35');
  });

  it('compares whether each row is gated, so a relabelled row cannot leave the 29 gated rows', () => {
    const rows = recomputeRows('fine1440cpu1', repetitionRecords('fine1440cpu1', population()));
    const frozen: Record<string, unknown>[] = rows.map((row) => ({ ...row }));
    expect(summarizeTable(frozen, rows)).toMatchObject({
      gated: 29,
      expectedGated: 29,
      passed: 29,
      allGatedPass: true,
      differences: [],
    });
    const flagged = frozen.map((row, index) => (index === 4 ? { ...row, informational: true } : row));
    const differences = [
      'gated rows 28 != 29',
      'fine1440cpu1 first-visit startupPolicyMs: informational true != false',
    ];
    expect(compareRows(flagged, rows)).toEqual(differences);
    expect(summarizeTable(flagged, rows)).toMatchObject({ gated: 28, passed: 28, allGatedPass: false, differences });
    const status = frozen.map((row, index) => (index === 4 ? { ...row, status: 'INFORMATIONAL_NO_GATE' } : row));
    expect(compareRows(status, rows)).toEqual([
      ...differences,
      'fine1440cpu1 first-visit startupPolicyMs: status INFORMATIONAL_NO_GATE != PASS_OBSERVED_ABSOLUTE_BUDGET',
    ]);
    expect(summarizeTable(status, rows)).toMatchObject({ gated: 28, allGatedPass: false });
    expect(summarizeTable(frozen.slice(0, 34), rows.slice(0, 34))).toMatchObject({
      gated: 28,
      allGatedPass: false,
      differences: ['gated rows 28 != 29'],
    });
  });
});

describe('APB2 stage outcome', () => {
  const finished = {
    smoke: false,
    run: { status: 'FIXED_APB2_COLLECTION_RETAINED_NOT_ACCEPTANCE', observations: 72 },
    errors: 0,
    collectionEqual: true,
    closed: true,
    after: true,
  };

  it('holds a stage whose Chrome did not close or whose after-run bookend is missing', () => {
    expect(closureErrors({ closed: true }, { at: 'after' })).toEqual([]);
    expect(closureErrors({ closed: false }, undefined).map((error) => error.kind)).toEqual(['CLOSURE']);
    expect(closureErrors(undefined, undefined).map((error) => error.kind)).toEqual(['CLOSURE']);
    expect(closureErrors({ closed: true }, undefined).map((error) => error.kind)).toEqual(['AFTER_BOOKEND']);
    expect(stageResult(finished)).toBe('CAPTURE_COMPLETE_TABLE_RECOMPUTED');
    expect(stageResult({ ...finished, closed: false })).toBe('HOLD');
    expect(stageResult({ ...finished, after: false })).toBe('HOLD');
    expect(stageResult({ ...finished, errors: closureErrors({ closed: true }, undefined).length })).toBe('HOLD');
    expect(stageResult({ ...finished, collectionEqual: false })).toBe('HOLD');
    expect(stageResult({ ...finished, run: { ...finished.run, observations: 71 } })).toBe('HOLD');
    expect(stageResult({ ...finished, run: undefined })).toBe('HOLD');
    const smoke = { ...finished, smoke: true, run: { status: 'STOPPED', observations: 3 } };
    expect(stageResult(smoke)).toBe('SMOKE_PASSED_NO_TIMING_CLAIMS');
    expect(stageResult({ ...smoke, closed: false })).toBe('SMOKE_FAILED');
    expect(stageResult({ ...smoke, after: false })).toBe('SMOKE_FAILED');
    expect(stageResult({ ...smoke, run: { status: 'STOPPED', observations: 0 } })).toBe('SMOKE_FAILED');
  });

  it('re-checks the physical closure until it holds, for a bounded settle time', async () => {
    let clock = 0;
    const timing = {
      now: () => clock,
      sleep: (ms: number) => {
        clock += ms;
        return Promise.resolve();
      },
    };
    const answers = [false, false, true];
    expect(await settleClosure(() => Promise.resolve({ closed: answers.shift() ?? false }), timing)).toEqual({
      closed: true,
      attempts: 3,
      settleMs: 1000,
    });
    clock = 0;
    expect(await settleClosure(() => Promise.resolve({ closed: false }), { ...timing, timeoutMs: 2000 })).toEqual({
      closed: false,
      attempts: 5,
      settleMs: 2000,
    });
  });
});

describe('APB2 runner inputs', () => {
  it('parses each command and refuses unknown, missing or misplaced arguments', () => {
    expect(parseApb2Arguments(['verify', '--protocol', 'p'])).toEqual({ command: 'verify', protocol: 'p' });
    expect(
      parseApb2Arguments([
        'stage',
        '--profile',
        'coarse393cpu4',
        '--dist',
        'dist',
        '--evidence',
        'out',
        '--stage-id',
        'r24-b-coarse393cpu4',
        '--browser-version',
        '154.0.8037.93',
        '--quiet-attested',
      ]),
    ).toMatchObject({ command: 'stage', profile: 'coarse393cpu4', quietAttested: true, smoke: false });
    expect(() => parseApb2Arguments(['stage', '--profile', 'fine1440cpu1'])).toThrow(/stage needs --/);
    expect(() => parseApb2Arguments(['verify', '--smoke'])).toThrow(/does not apply/);
    expect(() =>
      parseApb2Arguments([
        'collect',
        '--profile',
        'tablet',
        '--capture',
        'c',
        '--dist',
        'd',
        '--evidence',
        'e',
        '--name',
        'n',
      ]),
    ).toThrow(/Unknown profile/);
    expect(() => parseApb2Arguments(['collect', '--bogus', 'x'])).toThrow(/Unknown argument/);
    expect(() => parseApb2Arguments(['run'])).toThrow(/Usage/);
  });

  it('maps a run to its exit code', () => {
    expect(exitCode({ complete: true, allGatedPass: true })).toBe(0);
    expect(exitCode({ complete: true, allGatedPass: false })).toBe(2);
    expect(exitCode({ complete: false, allGatedPass: false })).toBe(1);
    expect(exitCode({ complete: false, smokePassed: true, allGatedPass: false })).toBe(0);
  });

  it('reads the module entry and the committed DB_VERSION the fixture opens at', () => {
    expect(moduleEntry('<script type="module" crossorigin src="/assets/index-AbC123.js"></script>')).toBe(
      '/assets/index-AbC123.js',
    );
    expect(() => moduleEntry('<script src="/assets/index-a.js"></script>')).toThrow(/exactly one module entry/);
    expect(fixtureDbVersion("export const DB_NAME = 'x';\nexport const DB_VERSION = 3;\n")).toBe(3);
    expect(() => fixtureDbVersion('export const DB_VERSION = VERSION;\n')).toThrow(/integer literal/);
  });
});

const SHA = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const bound = (name: string) => ({ path: `evidence/${name}`, sha256: 'c'.repeat(64) });
const files = (): Apb2GateProfile['files'] => ({
  stage: bound('stage.json'),
  table: bound('table.json'),
  records: bound('index.json'),
  captureRun: bound('run.json'),
});
const complete = (passed = 29) => ({
  result: 'CAPTURE_COMPLETE_TABLE_RECOMPUTED',
  collection: { equal: true, gated: 29, passed, allGatedPass: passed === 29 },
});
const verified = { ok: true, files: 145, freezeSha256: 'd'.repeat(64) };
const receiptFor = (profiles: Apb2GateProfile[], verification: typeof verified | null = verified) =>
  gateReceipt({
    source: { sha: SHA, tree: TREE },
    profiles,
    verification,
    browserVersion: '154.0.8037.93',
    runner: {},
  });

describe('APB2 gate receipt', () => {
  it('accepts the hook form and each gate step, with the operator Chrome from the environment', () => {
    expect(parseApb2Arguments(['--evidence', 'out/apb2'], { PLAY100_APB2_BROWSER_VERSION: '154.0.8037.93' })).toEqual({
      command: 'gate',
      protocol: undefined,
      evidence: 'out/apb2',
      dist: 'dist',
      browserVersion: '154.0.8037.93',
      step: 'all',
    });
    expect(
      parseApb2Arguments(
        ['gate', '--evidence', 'd', '--step', 'receipt', '--browser-version', '154.0.8037.93', '--dist', 'x'],
        {},
      ),
    ).toMatchObject({ command: 'gate', step: 'receipt', dist: 'x', browserVersion: '154.0.8037.93' });
    expect(() => parseApb2Arguments(['gate', '--evidence', 'd', '--step', 'tablet'], {})).toThrow(/Unknown gate step/);
    expect(() => parseApb2Arguments(['--evidence', 'd', '--smoke'], {})).toThrow(/does not apply to gate/);
  });

  it('binds the source the gate names to HEAD and requires the operator quiet attestation', () => {
    const env = { PLAY100_APB2_SOURCE_COMMIT: SHA, PLAY100_APB2_SOURCE_TREE: TREE };
    expect(gateSource(env, SHA, TREE)).toEqual({ sha: SHA, tree: TREE });
    expect(() => gateSource(env, 'e'.repeat(40), TREE)).toThrow(/not this checkout's HEAD/);
    expect(() => gateSource(env, SHA, 'e'.repeat(40))).toThrow(/not this checkout's tree/);
    expect(() => gateSource({}, SHA, TREE)).toThrow(/must name the full candidate commit/);
    expect([
      quietAttested({ PLAY100_APB2_QUIET_ATTESTED: '1' }),
      quietAttested({ PLAY100_APB2_QUIET_ATTESTED: 'yes' }),
      quietAttested({}),
    ]).toEqual([true, false, false]);
    const id = gateStageId(SHA, '20261002201500', 'coarse393cpu4');
    expect(id).toBe('gaaaaaaaa-20261002201500-coarse393cpu4');
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]{2,60}$/);
  });

  it('passes only when both profiles are complete, recomputed equal and every gated row passes', () => {
    const passing = receiptFor([
      gateProfile('fine1440cpu1', 'f', complete(), files()),
      gateProfile('coarse393cpu4', 'c', complete(), files()),
    ]);
    expect(passing).toMatchObject({
      schemaVersion: 1,
      source: { sha: SHA, tree: TREE },
      status: 'passed',
      complete: true,
      reasons: [],
    });
    expect(checkApb2GateReceipt(passing, { sha: SHA, tree: TREE })).toEqual({
      schemaVersion: 1,
      source: { sha: SHA, tree: TREE },
      status: 'passed',
    });
    expect(gateExitCode(passing)).toBe(0);

    const budgetMiss = receiptFor([
      gateProfile('fine1440cpu1', 'f', complete(), files()),
      gateProfile('coarse393cpu4', 'c', complete(28), files()),
    ]);
    expect(budgetMiss).toMatchObject({
      status: 'failed',
      complete: true,
      reasons: ['coarse393cpu4: 1 of 29 gated rows did not pass.'],
    });
    expect(() => checkApb2GateReceipt(budgetMiss, { sha: SHA, tree: TREE })).toThrow('exact candidate');
    expect(gateExitCode(budgetMiss)).toBe(2);

    const partial = receiptFor([gateProfile('fine1440cpu1', 'f', { result: 'HOLD' }, files())]);
    expect(partial).toMatchObject({ status: 'failed', complete: false });
    expect(partial.reasons).toEqual(['fine1440cpu1: incomplete (HOLD).', 'coarse393cpu4: not run.']);
    expect(gateExitCode(partial)).toBe(1);

    const unequal = receiptFor([
      gateProfile(
        'fine1440cpu1',
        'f',
        { ...complete(), collection: { ...complete().collection, equal: false } },
        files(),
      ),
      gateProfile('coarse393cpu4', 'c', complete(), { ...files(), table: null }),
    ]);
    expect(unequal.reasons).toEqual([
      'fine1440cpu1: the recomputed table differs from the pinned aggregation.',
      'coarse393cpu4: a bound file is missing.',
    ]);
    expect(gateExitCode(unequal)).toBe(1);
    const unverified = receiptFor(
      [gateProfile('fine1440cpu1', 'f', complete(28), files()), gateProfile('coarse393cpu4', 'c', complete(), files())],
      null,
    );
    expect(unverified).toMatchObject({ status: 'failed', complete: false, pinnedSet: null });
    expect(unverified.reasons).toEqual([
      'The pinned set did not verify.',
      'fine1440cpu1: 1 of 29 gated rows did not pass.',
    ]);
    expect(gateExitCode(unverified)).toBe(1);
    expect(
      gateReceipt({
        source: { sha: SHA, tree: TREE },
        profiles: passing.profiles.filter((row) => row !== null),
        verification: verified,
        browserVersion: '154.0.8037.93',
        runner: {},
        failure: 'Port 4199 is busy.',
      }),
    ).toMatchObject({ status: 'failed', complete: false, reasons: ['Port 4199 is busy.'] });
    const relabelled = receiptFor([
      gateProfile('fine1440cpu1', 'f', complete(), files()),
      gateProfile(
        'coarse393cpu4',
        'c',
        { ...complete(), collection: { equal: true, gated: 28, passed: 28, allGatedPass: true } },
        files(),
      ),
    ]);
    expect(relabelled).toMatchObject({ status: 'failed', complete: false });
    expect(relabelled.reasons).toEqual(["coarse393cpu4: 28 gated rows, not the contract's 29."]);
    expect(relabelled.profiles[1]).toMatchObject({ gated: 28, passed: 28, allGatedPass: false });
    expect(gateExitCode(relabelled)).toBe(1);
    expect([
      stageExitCode('CAPTURE_COMPLETE_TABLE_RECOMPUTED', true),
      stageExitCode('CAPTURE_COMPLETE_TABLE_RECOMPUTED', false),
      stageExitCode('HOLD', true),
      stageExitCode(undefined, false),
    ]).toEqual([0, 2, 1, 1]);
  });

  it('passes the operator APB2 settings through the configured profile that strips PLAY100_ variables', () => {
    expect(
      apb2StepEnvironment(
        {
          PLAY100_APB2_PROTOCOL: 'pinned',
          PLAY100_APB2_QUIET_ATTESTED: '1',
          PLAY100_APB2_BROWSER_VERSION: '154.0.8037.93',
          PLAY100_OTHER: 'x',
        },
        { sha: SHA, tree: TREE },
      ),
    ).toEqual({
      PLAY100_APB2_SOURCE_COMMIT: SHA,
      PLAY100_APB2_SOURCE_TREE: TREE,
      PLAY100_APB2_PROTOCOL: 'pinned',
      PLAY100_APB2_QUIET_ATTESTED: '1',
      PLAY100_APB2_BROWSER_VERSION: '154.0.8037.93',
    });
    expect(apb2StepEnvironment({}, { sha: SHA, tree: TREE })).toEqual({
      PLAY100_APB2_SOURCE_COMMIT: SHA,
      PLAY100_APB2_SOURCE_TREE: TREE,
    });
  });
});
