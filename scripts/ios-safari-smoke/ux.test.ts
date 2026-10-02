import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runTouchUx } from './ux.ts';
import type { SmokeContext } from './ux.ts';

test('record every requested touch case and fail the suite when independent steps fail', async () => {
  const steps: string[] = [];
  async function fail<T>(): Promise<NonNullable<T>> {
    throw new Error('Expected unavailable fixture.');
  }
  const context: SmokeContext = {
    site: 'https://candidate.example.com',
    step: async (name, action) => {
      steps.push(name);
      await action();
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
  await assert.rejects(
    () => runTouchUx(context),
    (error: unknown) => error instanceof AggregateError && error.errors.length === 3,
  );
  assert.deepEqual(steps, ['09-queue-touch-reorder', '10-native-share', '11-google-outbound-back']);
});
