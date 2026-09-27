import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { candidateRules, migrationEmulators } from './fixtures/migration-rules';

const endpoints = migrationEmulators();
const repeat = (count: number, text: string) => Array.from({ length: count }, () => text).join(' && ');
// Every comparison holds, so only the evaluation limit can refuse a write. A write of 10 comparisons stays far under
// the 1,000-expression limit however the emulator counts each one. One of 1,200 exceeds it even at one expression per
// comparison, and so do 150 writes of 10 when one limit covers a whole commit.
const controlRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function ten(data) { return ${repeat(10, 'data.value == 1')}; }
    function hundred(data) { return ${repeat(10, 'ten(data)')}; }
    match /expressionUnits/{id} {
      allow create: if request.auth != null && request.auth.uid == 'BudgetOwner' && ten(request.resource.data);
    }
    match /expressionWide/{id} {
      allow create: if request.auth != null && request.auth.uid == 'BudgetOwner'
        && ${repeat(12, 'hundred(request.resource.data)')};
    }
    match /{document=**} { allow read, write: if false; }
  }
}`;
let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: endpoints.projectId,
    firestore: { host: endpoints.host, port: endpoints.port, rules: controlRules },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
});
afterAll(async () => {
  try {
    await environment?.cleanup();
  } finally {
    const restored = await initializeTestEnvironment({
      projectId: endpoints.projectId,
      firestore: { host: endpoints.host, port: endpoints.port, rules: candidateRules() },
    });
    await restored.cleanup();
  }
});

async function stored(path: string) {
  let size = -1;
  await environment.withSecurityRulesDisabled(async (context) => {
    size = (await context.firestore().collection(path).get()).size;
  });
  return size;
}
const refusal = (write: Promise<unknown>) => write.then(() => null, (cause: unknown) => cause);
const capped = (cause: unknown) => cause instanceof Error && cause.message.includes('maximum of 1000 expressions');

// What the save-commit tests can prove: a refusal on the limit names it in its message, so a refusal without that
// text was decided by the rules themselves; and one limit covers a whole commit, shared by all of its writes, as
// Firebase documents it per request, so a commit that succeeds keeps all of its writes together within the limit.
describe('emulator expression-limit calibration, not production permissions', () => {
  it('accepts one write of 10 holding comparisons and refuses one of 1,200 on the named evaluation limit', async () => {
    const db = environment.authenticatedContext('BudgetOwner').firestore();
    await db.doc('expressionUnits/single').set({ value: 1 });
    const refused = await refusal(db.doc('expressionWide/single').set({ value: 1 }));
    expect(refused).toMatchObject({ code: 'permission-denied' });
    expect(capped(refused)).toBe(true);
    expect(await stored('expressionUnits')).toBe(1);
    expect(await stored('expressionWide')).toBe(0);
  });
  it('shares one limit across a commit: five writes of 10 comparisons commit and 150 are refused on it', async () => {
    const db = environment.authenticatedContext('BudgetOwner').firestore();
    const commit = (count: number, prefix: string) => {
      const batch = db.batch();
      for (let index = 0; index < count; index += 1)
        batch.set(db.doc(`expressionUnits/${prefix}-${index}`), { value: 1 });
      return batch.commit();
    };
    await commit(5, 'small');
    const refused = await refusal(commit(150, 'large'));
    expect(refused).toMatchObject({ code: 'permission-denied' });
    expect(capped(refused)).toBe(true);
    expect(await stored('expressionUnits')).toBe(5);
  });
});