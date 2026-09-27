import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { candidateRules, migrationEmulators } from './fixtures/migration-rules';

const endpoints = migrationEmulators();
const repeat = (count: number, text: string) => Array.from({ length: count }, () => text).join(' && ');
// Every comparison holds, so only the evaluation limit can refuse a write. A write of 10 comparisons stays far under
// the 1,000-expression limit however the emulator counts each one. One of 1,200 exceeds it even at one expression per
// comparison, and so would 150 writes of 10 if one limit covered their whole commit.
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
const refusal = (write: Promise<unknown>) =>
  write.then(
    () => null,
    (cause: unknown) => cause,
  );
const capped = (cause: unknown) => cause instanceof Error && cause.message.includes('maximum of 1000 expressions');

// What the save-commit tests can prove: the emulator decides each write of a commit within its own limit, and refuses
// a write over it with the limit named in its message. The message can also name the limit from a first, commit-wide
// pass that does not decide the outcome, so its text cannot show which check refused a write; an otherwise identical
// write that is accepted can.
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
  it('decides each write of a commit within its own limit: 150 writes of 10 comparisons commit together', async () => {
    const db = environment.authenticatedContext('BudgetOwner').firestore();
    const batch = db.batch();
    for (let index = 0; index < 150; index += 1) batch.set(db.doc(`expressionUnits/unit-${index}`), { value: 1 });
    await batch.commit();
    expect(await stored('expressionUnits')).toBe(150);
  });
});
