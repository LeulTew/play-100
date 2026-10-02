import type { Budget } from './release-apb2-contract';

/**
 * APB2 statistics, ported from the frozen v3.2 aggregation (APB1 absoluteBudget and the APB2 input interval rules) so
 * the committed runner can recompute every table row from the per-repetition records and require equality with the
 * frozen result. Eight repetitions, nearest-rank p75 (the sixth of eight), the maximum, and any failed run fails the cap.
 */
export type Measurement =
  | { kind: 'FINITE'; valueMs: number }
  | { kind: 'BELOW_THRESHOLD'; lowerInclusiveMs: 0; upperExclusiveMs: 16 }
  | { kind: 'BOUNDED'; lowerInclusiveMs: number; upperMs: number; upperExclusive: boolean }
  | { kind: 'UNKNOWN'; reason: string };

export type RowStatus = 'PASS_OBSERVED_ABSOLUTE_BUDGET' | 'FAIL_OBSERVED_BUDGET' | 'FAIL_FAILED_RUN_CAP' | 'UNKNOWN';

export interface MemberRow<T> {
  repetition: number;
  present: boolean;
  failed: boolean;
  value: T;
}

export const P75_INDEX = 5;
const unknown = (reason: string): Measurement => ({ kind: 'UNKNOWN', reason });
export const finite = (valueMs: number): Measurement =>
  Number.isFinite(valueMs) && valueMs >= 0 ? { kind: 'FINITE', valueMs } : unknown('INVALID_NATIVE_DURATION');
export const belowThreshold = (): Measurement => ({
  kind: 'BELOW_THRESHOLD',
  lowerInclusiveMs: 0,
  upperExclusiveMs: 16,
});

const complete = (rows: readonly MemberRow<unknown>[], available: number) =>
  rows.length === 8 &&
  rows.every((row) => Number.isInteger(row.repetition) && row.repetition >= 0 && row.repetition < 8) &&
  new Set(rows.map((row) => row.repetition)).size === 8 &&
  available === 8;

/** A numeric metric (semantic readiness, longest LoAF, startup policy) against its p75 and cap. */
export function absoluteBudget(rows: readonly MemberRow<number | null>[], budget: Budget) {
  const usable = (value: number | null): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const values = rows
    .map((row) => row.value)
    .filter(usable)
    .sort((a, b) => a - b);
  const failedRepetitions = rows.filter((row) => row.failed).map((row) => row.repetition);
  const missing = rows.filter((row) => !row.present || !usable(row.value)).map((row) => row.repetition);
  const whole = complete(rows, values.length) && missing.length === 0;
  const p75 = whole ? (values[P75_INDEX] ?? null) : null;
  const max = values.length ? (values.at(-1) ?? null) : null;
  const status: RowStatus = failedRepetitions.length
    ? 'FAIL_FAILED_RUN_CAP'
    : max !== null && max > budget.cap
      ? 'FAIL_OBSERVED_BUDGET'
      : !whole || p75 === null
        ? 'UNKNOWN'
        : p75 <= budget.p75 && max !== null && max <= budget.cap
          ? 'PASS_OBSERVED_ABSOLUTE_BUDGET'
          : 'FAIL_OBSERVED_BUDGET';
  return {
    status,
    p75,
    max,
    budget,
    finiteCount: values.length,
    failedRepetitions,
    missingOrUnknownRepetitions: missing,
  };
}

const known = (value: Measurement | null | undefined): value is Measurement =>
  (value?.kind === 'FINITE' && Number.isFinite(value.valueMs) && value.valueMs >= 0) ||
  (value?.kind === 'BELOW_THRESHOLD' && value.upperExclusiveMs === 16);

/** The largest of one journey's action values; any unknown action makes the journey value unknown. */
export function maximumMeasurement(values: readonly Measurement[]): Measurement {
  if (!values.length || values.some((value) => !known(value))) return unknown('INCOMPLETE_JOURNEY_ACTION_VALUES');
  const measured = values.flatMap((value) => (value.kind === 'FINITE' ? [value.valueMs] : []));
  if (!values.some((value) => value.kind === 'BELOW_THRESHOLD')) return finite(Math.max(...measured));
  if (measured.length && Math.max(...measured) >= 16) return finite(Math.max(...measured));
  return belowThreshold();
}

/** The order statistic of interval-censored input values, carrying the "<16" bound instead of imputing a number. */
export function orderStatistic(values: readonly Measurement[], index: number): Measurement {
  const lower = values.map((value) => (value.kind === 'FINITE' ? value.valueMs : 0)).sort((a, b) => a - b)[index];
  const upper = values
    .map((value) => ({ ms: value.kind === 'FINITE' ? value.valueMs : 16, exclusive: value.kind === 'BELOW_THRESHOLD' }))
    .sort((a, b) => a.ms - b.ms || Number(b.exclusive) - Number(a.exclusive))[index];
  if (lower === undefined || upper === undefined) return unknown('MISSING_ORDER_STATISTIC');
  if (lower === upper.ms && !upper.exclusive) return finite(lower);
  if (upper.ms <= 16 && upper.exclusive) return belowThreshold();
  return { kind: 'BOUNDED', lowerInclusiveMs: lower, upperMs: upper.ms, upperExclusive: upper.exclusive };
}

export const satisfies = (value: Measurement, budget: number) =>
  value.kind === 'FINITE'
    ? value.valueMs <= budget
    : value.kind === 'BELOW_THRESHOLD'
      ? 16 <= budget
      : value.kind === 'BOUNDED'
        ? value.upperMs <= budget
        : false;

export function formatMeasurement(value: Measurement | null | undefined): string {
  if (value?.kind === 'FINITE') return value.valueMs.toFixed(1);
  if (value?.kind === 'BELOW_THRESHOLD') return '<16';
  if (value?.kind === 'BOUNDED')
    return `[${value.lowerInclusiveMs}, ${value.upperMs}${value.upperExclusive ? ')' : ']'}`;
  return 'UNKNOWN';
}

/** The input-response metric: Event Timing values with explicit interval censoring, never a fabricated zero. */
export function inputBudget(rows: readonly MemberRow<Measurement | null>[], budget: Budget) {
  const failedRepetitions = rows.filter((row) => row.failed).map((row) => row.repetition);
  const available = rows.filter((row) => row.present && known(row.value));
  const whole = complete(rows, available.length);
  const values = available.map((row) => row.value as Measurement);
  const p75 = whole ? orderStatistic(values, P75_INDEX) : unknown('FEWER_THAN_EIGHT_KNOWN_REPETITIONS');
  const max = values.length ? maximumMeasurement(values) : unknown('NO_KNOWN_REPETITIONS');
  const anyCapBreach = values.some((value) => value.kind === 'FINITE' && value.valueMs > budget.cap);
  const status: RowStatus = failedRepetitions.length
    ? 'FAIL_FAILED_RUN_CAP'
    : anyCapBreach
      ? 'FAIL_OBSERVED_BUDGET'
      : !whole
        ? 'UNKNOWN'
        : satisfies(p75, budget.p75) && satisfies(max, budget.cap)
          ? 'PASS_OBSERVED_ABSOLUTE_BUDGET'
          : 'FAIL_OBSERVED_BUDGET';
  return {
    status,
    p75,
    max,
    p75Display: formatMeasurement(p75),
    maxDisplay: formatMeasurement(max),
    budget,
    failedRepetitions,
    finiteCount: values.filter((value) => value.kind === 'FINITE').length,
    belowThresholdCount: values.filter((value) => value.kind === 'BELOW_THRESHOLD').length,
    unknownRepetitions: rows.filter((row) => !row.present || !known(row.value)).map((row) => row.repetition),
  };
}

/** An informational paint metric: p75 and maximum of the finite values, no budget and no status gate. */
export function informationalSummary(values: readonly (number | null)[], allowNegative: boolean) {
  const observed = values
    .filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value) && (allowNegative || value >= 0),
    )
    .sort((a, b) => a - b);
  return {
    p75: observed.length === 8 ? (observed[P75_INDEX] ?? null) : null,
    max: observed.length ? (observed.at(-1) ?? null) : null,
    finiteCount: observed.length,
  };
}

/** A comparable form of a numeric or interval value, so a recomputed row can be matched against the frozen one. */
export function normalizedValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const measurement = value as Partial<Record<string, unknown>>;
  switch (measurement.kind) {
    case 'FINITE':
      return { kind: 'FINITE', valueMs: measurement.valueMs };
    case 'BELOW_THRESHOLD':
      return { kind: 'BELOW_THRESHOLD' };
    case 'BOUNDED':
      return {
        kind: 'BOUNDED',
        lowerInclusiveMs: measurement.lowerInclusiveMs,
        upperMs: measurement.upperMs,
        upperExclusive: measurement.upperExclusive,
      };
    case 'UNKNOWN':
      return { kind: 'UNKNOWN' };
    default:
      return { kind: 'UNRECOGNISED' };
  }
}
