export async function withActionCleanup(work: () => Promise<void>, cleanups: (() => Promise<unknown>)[]) {
  let primary: { cause: unknown } | null = null;
  try {
    await work();
  } catch (cause) {
    primary = { cause };
  }
  const errors: unknown[] = [];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (cause) {
      errors.push(cause);
    }
  }
  if (primary) {
    if (errors.length) console.error('Action cleanup also failed after the primary test failure.', ...errors);
    throw primary.cause;
  }
  if (errors.length) throw new AggregateError(errors, 'Action cleanup failed.');
}
