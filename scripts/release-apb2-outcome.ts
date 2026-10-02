import { APB2_CONTEXTS_PER_STAGE } from './release-apb2-contract';

/**
 * How one APB2 stage ends. The owned Chrome must close physically, with its process tree and both ports gone, and the
 * after-run bookend must re-check HEAD, the tree, the build and the pinned set. A stage missing either is held.
 */
export interface ClosureCheck {
  closed: boolean;
}

/**
 * Repeats the physical-closure check until it holds or the settle time runs out. Chrome's child processes can outlive
 * the browser's own exit by a moment, so a single immediate check could hold a clean stage.
 */
export async function settleClosure<T extends ClosureCheck>(
  check: () => Promise<T>,
  options: { timeoutMs?: number; intervalMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T & { attempts: number; settleMs: number }> {
  const {
    timeoutMs = 15000,
    intervalMs = 500,
    now = Date.now,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  } = options;
  const started = now();
  for (let attempts = 1; ; attempts += 1) {
    const result = await check();
    const settleMs = now() - started;
    if (result.closed || settleMs >= timeoutMs) return { ...result, attempts, settleMs };
    await sleep(intervalMs);
  }
}

/** The errors a stage's end records: a physical closure that never held, or a missing after-run bookend. */
export function closureErrors(closure: ClosureCheck | undefined, after: unknown) {
  if (closure?.closed !== true)
    return [
      {
        kind: 'CLOSURE',
        message:
          'The owned Chrome or a port did not close, so the after-run HEAD, tree, build and pinned-set re-check was not taken.',
      },
    ];
  if (!after)
    return [{ kind: 'AFTER_BOOKEND', message: 'The after-run HEAD, tree, build and pinned-set re-check is missing.' }];
  return [];
}

/**
 * A stage's result. A campaign stage is complete only with the full 72-context capture, no error, a recomputation
 * equal to the pinned aggregation, a physical closure and the after-run bookend; anything less is HOLD. A smoke needs
 * the same apart from the full population.
 */
export function stageResult(input: {
  smoke: boolean;
  run: { status: string; observations: number } | undefined;
  errors: number;
  collectionEqual: boolean;
  closed: boolean;
  after: boolean;
}) {
  const clean = input.errors === 0 && input.collectionEqual && input.closed && input.after;
  if (input.smoke)
    return clean && input.run !== undefined && input.run.observations > 0
      ? 'SMOKE_PASSED_NO_TIMING_CLAIMS'
      : 'SMOKE_FAILED';
  return clean &&
    input.run?.status === 'FIXED_APB2_COLLECTION_RETAINED_NOT_ACCEPTANCE' &&
    input.run.observations === APB2_CONTEXTS_PER_STAGE
    ? 'CAPTURE_COMPLETE_TABLE_RECOMPUTED'
    : 'HOLD';
}
