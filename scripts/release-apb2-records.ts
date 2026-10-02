import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  APB2_GATED_ROWS,
  APB2_PROTOCOL,
  APB2_REPETITIONS,
  apb2Schedule,
  budgetFor,
  gatedMetrics,
  informationalMetrics,
  type Apb2Journey,
  type Apb2Kind,
  type Apb2ProfileId,
  type GatedMetric,
  type InformationalMetric,
} from './release-apb2-contract';
import {
  absoluteBudget,
  informationalSummary,
  inputBudget,
  normalizedValue,
  type Measurement,
  type MemberRow,
} from './release-apb2-stats';

/** One context of the fixed schedule, as the committed runner records it: present or not, never replaced. */
export interface RepetitionRecord {
  protocol: typeof APB2_PROTOCOL;
  commit: string | null;
  profile: Apb2ProfileId;
  journey: Apb2Journey;
  kind: Apb2Kind;
  repetition: number;
  ordinal: number;
  present: boolean;
  status: string | null;
  failed: boolean;
  originalRunFailed: boolean;
  fixtureUnknown: boolean;
  values: {
    inputResponse: Measurement | null;
    semanticReadyMs: number | null;
    longestLoafMs: number | null;
    startupPolicyMs: number | null;
    fcpMs: number | null;
    lcpAtBoundaryMs: number | null;
    firstPaintMs: number | null;
    firstPaintMinusDclMs: number | null;
  };
  source: { file: string; sha256: string } | null;
}

/** The parts of a captured sample (an observation file of the frozen capture) the records keep. */
export interface CapturedSample {
  journey: string;
  repetition: number;
  commit?: string;
  status?: string;
  apbFailedRun?: boolean;
  profile?: { id?: string };
  apb2HintFixture?: { status?: string };
  apb2Values?: Record<string, unknown>;
}

const numberOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * One record per scheduled context. As in the frozen aggregation, a sample whose hint fixture is UNKNOWN makes its values
 * unknown instead of failing the run (`originalRunFailed` keeps the raw verdict); a missing sample stays a missing record.
 */
export function repetitionRecords(
  profile: Apb2ProfileId,
  samples: readonly { file: string; sha256: string; sample: CapturedSample }[],
): RepetitionRecord[] {
  for (const { sample } of samples) {
    if (sample.profile?.id !== profile) throw new Error(`A sample of another profile: ${sample.journey}.`);
  }
  if (new Set(samples.map(({ sample }) => sample.commit ?? null)).size > 1)
    throw new Error('Cannot pool different builds.');
  return apb2Schedule(profile).map((entry) => {
    const matches = samples.filter(
      ({ sample }) => sample.journey === entry.journey && sample.repetition === entry.repetition,
    );
    if (matches.length > 1) throw new Error(`Duplicate repetition ${entry.journey} r${entry.repetition}.`);
    const match = matches[0];
    const values = match?.sample.apb2Values ?? {};
    const fixtureUnknown = match?.sample.apb2HintFixture?.status === 'UNKNOWN';
    const originalRunFailed = Boolean(
      match && (match.sample.apbFailedRun || match.sample.status !== 'OBSERVED_SCOPED_CURRENT_SAMPLE'),
    );
    const input = values.inputResponse as Measurement | undefined;
    return {
      protocol: APB2_PROTOCOL,
      commit: match?.sample.commit ?? null,
      profile,
      journey: entry.journey,
      kind: entry.kind,
      repetition: entry.repetition,
      ordinal: entry.ordinal,
      present: Boolean(match),
      status: match?.sample.status ?? null,
      failed: fixtureUnknown ? false : originalRunFailed,
      originalRunFailed,
      fixtureUnknown,
      values: {
        inputResponse: input && typeof input === 'object' && 'kind' in input ? input : null,
        semanticReadyMs: numberOrNull(values.semanticReadyMs),
        longestLoafMs: numberOrNull(values.longestLoafMs),
        startupPolicyMs: numberOrNull(values.startupPolicyMs),
        fcpMs: numberOrNull(values.fcpMs),
        lcpAtBoundaryMs: numberOrNull(values.lcpAtBoundaryMs),
        firstPaintMs: numberOrNull(values.firstPaintMs),
        firstPaintMinusDclMs: numberOrNull(values.firstPaintMinusDclMs),
      },
      source: match ? { file: match.file, sha256: match.sha256 } : null,
    };
  });
}

export const recordName = (record: Pick<RepetitionRecord, 'ordinal' | 'journey' | 'profile' | 'repetition'>) =>
  `${String(record.ordinal).padStart(2, '0')}-${record.journey}-${record.profile}-r${record.repetition}.json`;

/** Writes each record once as its own JSON file, then an index that names every file by SHA-256. */
export async function writeRepetitionRecords(directory: string, records: readonly RepetitionRecord[]) {
  await mkdir(directory, { recursive: false });
  const files: { file: string; sha256: string; present: boolean }[] = [];
  for (const record of records) {
    const file = recordName(record);
    const bytes = JSON.stringify(record, null, 2) + '\n';
    await writeFile(path.join(directory, file), bytes, { flag: 'wx' });
    files.push({ file, sha256: createHash('sha256').update(bytes).digest('hex'), present: record.present });
  }
  const index = {
    protocol: APB2_PROTOCOL,
    records: files.length,
    present: files.filter((row) => row.present).length,
    files,
  };
  await writeFile(path.join(directory, 'index.json'), JSON.stringify(index, null, 2) + '\n', { flag: 'wx' });
  return index;
}

export interface TableRow {
  profile: Apb2ProfileId;
  journey: Apb2Journey;
  metric: GatedMetric | InformationalMetric;
  informational: boolean;
  status: string;
  p75: unknown;
  max: unknown;
  finiteCount: number;
  failedRepetitions: number[];
}

/** Recomputes every row of one profile's table from its records, in the frozen aggregation's row order. */
export function recomputeRows(profile: Apb2ProfileId, records: readonly RepetitionRecord[]): TableRow[] {
  const rows: TableRow[] = [];
  for (const entry of apb2Schedule(profile).filter((value) => value.repetition === 0)) {
    const members = Array.from({ length: APB2_REPETITIONS }, (_, repetition) => {
      const matches = records.filter((record) => record.journey === entry.journey && record.repetition === repetition);
      if (matches.length !== 1) throw new Error(`Expected one record for ${entry.journey} r${repetition}.`);
      return matches[0] as RepetitionRecord;
    });
    for (const metric of gatedMetrics(entry.kind)) {
      const budget = budgetFor(profile, metric, entry.journey);
      const base = (record: RepetitionRecord) => ({
        repetition: record.repetition,
        present: record.present,
        failed: record.failed,
      });
      const row =
        metric === 'inputResponse'
          ? inputBudget(
              members.map((record): MemberRow<Measurement | null> => ({
                ...base(record),
                value: !record.present
                  ? { kind: 'UNKNOWN', reason: 'MISSING_RUN' }
                  : record.fixtureUnknown
                    ? { kind: 'UNKNOWN', reason: 'HINT_FIXTURE_INVALID' }
                    : (record.values.inputResponse ?? { kind: 'UNKNOWN', reason: 'MISSING_RUN' }),
              })),
              budget,
            )
          : absoluteBudget(
              members.map((record): MemberRow<number | null> => ({
                ...base(record),
                value: record.fixtureUnknown ? null : record.values[metric],
              })),
              budget,
            );
      rows.push({
        profile,
        journey: entry.journey,
        metric,
        informational: false,
        status: row.status,
        p75: row.p75,
        max: row.max,
        finiteCount: row.finiteCount,
        failedRepetitions: row.failedRepetitions,
      });
    }
    for (const metric of informationalMetrics(entry.kind)) {
      const summary = informationalSummary(
        members.map((record) => (record.fixtureUnknown ? null : record.values[metric])),
        metric === 'firstPaintMinusDclMs',
      );
      rows.push({
        profile,
        journey: entry.journey,
        metric,
        informational: true,
        status: 'INFORMATIONAL_NO_GATE',
        p75: summary.p75,
        max: summary.max,
        finiteCount: summary.finiteCount,
        failedRepetitions: [],
      });
    }
  }
  return rows;
}

/** Whether the table treats a pinned aggregation row as informational: by its flag or its no-gate status. */
export function frozenInformational(row: Record<string, unknown>) {
  return row.informational === true || row.status === 'INFORMATIONAL_NO_GATE';
}

/**
 * Field-by-field differences between the frozen aggregation's rows and the recomputed ones (empty when equal),
 * including whether each row is gated, and a gated-row count other than the contract's.
 */
export function compareRows(frozen: readonly Record<string, unknown>[], recomputed: readonly TableRow[]): string[] {
  const differences: string[] = [];
  if (frozen.length !== recomputed.length) differences.push(`row count ${frozen.length} != ${recomputed.length}`);
  const gated = frozen.filter((row) => !frozenInformational(row)).length;
  if (gated !== APB2_GATED_ROWS) differences.push(`gated rows ${gated} != ${APB2_GATED_ROWS}`);
  recomputed.forEach((row, index) => {
    const other = frozen[index];
    const label = `${row.profile} ${row.journey} ${row.metric}`;
    if (!other) return;
    if (other.journey !== row.journey || other.metric !== row.metric || other.profile !== row.profile) {
      differences.push(`${label}: frozen row ${String(other.journey)} ${String(other.metric)}`);
      return;
    }
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (frozenInformational(other) !== row.informational)
      differences.push(`${label}: informational ${frozenInformational(other)} != ${row.informational}`);
    if (other.status !== row.status) differences.push(`${label}: status ${String(other.status)} != ${row.status}`);
    if (!same(normalizedValue(other.p75), normalizedValue(row.p75))) differences.push(`${label}: p75`);
    if (!same(normalizedValue(other.max), normalizedValue(row.max))) differences.push(`${label}: max`);
    if (other.finiteCount !== row.finiteCount) differences.push(`${label}: finiteCount`);
    if (!row.informational && !same(other.failedRepetitions ?? [], row.failedRepetitions)) {
      differences.push(`${label}: failedRepetitions`);
    }
  });
  return differences;
}

/**
 * One profile's table: the pinned aggregation's rows as the table classifies them, beside the recomputed status, with
 * the gated count, its passes and every difference. All gated rows pass only when there are exactly the contract's
 * 29, so a row relabelled informational cannot drop out of the gate.
 */
export function summarizeTable(frozen: readonly Record<string, unknown>[], recomputed: readonly TableRow[]) {
  const differences = compareRows(frozen, recomputed);
  const rows = frozen.map((row, position) => ({
    journey: row.journey,
    metric: row.metric,
    informational: frozenInformational(row),
    status: row.status,
    p75: row.p75,
    max: row.max,
    budget: row.budget ?? null,
    finiteCount: row.finiteCount,
    failedRepetitions: row.failedRepetitions ?? [],
    recomputedStatus: recomputed[position]?.status ?? null,
  }));
  const gated = rows.filter((row) => !row.informational);
  const passed = gated.filter((row) => /^PASS/.test(String(row.status))).length;
  return {
    rows,
    gated: gated.length,
    expectedGated: APB2_GATED_ROWS,
    passed,
    allGatedPass: gated.length === APB2_GATED_ROWS && passed === gated.length,
    differences,
  };
}
