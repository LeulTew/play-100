import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runTouchUx } from './ux.ts';
import type { SmokeContext } from './ux.ts';
import { productionOrigin } from './target.ts';

function fixture(site: string) {
  const steps: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  async function fail<T>(): Promise<NonNullable<T>> {
    throw new Error('Expected unavailable fixture.');
  }
  const context: SmokeContext = {
    site,
    step: async (name, action) => {
      steps.push(name);
      await action();
    },
    skip: async (name, reason) => {
      skipped.push({ name, reason });
    },
    wd: fail,
    execute: fail,
    waitFor: fail,
    click: fail,
    navigation: fail,
    drag: fail,
    nativeAction: fail,
    nativeTouch: fail,
    collectErrors: fail,
    installCollector: fail,
    assertLoaded: fail,
    capture: fail,
    artifact: fail,
  };
  return { context, steps, skipped };
}

test('record every production touch case and fail when independent steps fail', async () => {
  const { context, steps, skipped } = fixture(productionOrigin);
  await assert.rejects(
    () => runTouchUx(context),
    (error: unknown) => error instanceof AggregateError && error.errors.length === 3,
  );
  assert.deepEqual(steps, ['09-queue-touch-reorder', '10-native-share', '11-google-outbound-back']);
  assert.deepEqual(skipped, []);
});

test('skip Google outside production without counting it as pass or failure', async () => {
  const { context, steps, skipped } = fixture('https://candidate.example.com');
  await assert.rejects(
    () => runTouchUx(context),
    (error: unknown) => error instanceof AggregateError && error.errors.length === 2,
  );
  assert.deepEqual(steps, ['09-queue-touch-reorder', '10-native-share']);
  assert.deepEqual(skipped, [
    {
      name: '11-google-outbound-back',
      reason: "SKIPPED: requires an origin on the API key's referrer list",
    },
  ]);
});
