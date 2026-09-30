import { test } from '@playwright/test';
import { emulatorRulesGate } from '../scripts/playwright-env';

/** Tags every group that loads Firestore rules, so a run with more workers can cover them in a one-worker pass. */
export const EMULATOR_RULES_TAG = '@emulator-rules';

/**
 * Called first in the beforeAll hook of a group that loads Firestore rules into the demo-play100 emulator, before it
 * loads any. The emulator keeps one rule set for the project, so in a run with more than one worker, another worker's
 * tests would run against these rules (docs/intermittents.md, REL-10). There the group skips itself, or fails inside the
 * release gate, whose emulator runs use one worker. Returns only when the group may load its rules.
 */
export function requireOnlyWorker(): void {
  const gate = emulatorRulesGate(process.env, test.info().config.workers);
  if (gate === 'refuse')
    throw new Error(
      `This group loads Firestore rules for every worker's tests. The release gate must run it with --workers=1.`,
    );
  test.skip(
    gate === 'skip',
    `Loads Firestore rules for every worker's tests: run it alone with --workers=1 --grep ${EMULATOR_RULES_TAG}.`,
  );
}
