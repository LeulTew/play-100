import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { candidateRules, migrationEmulators } from './fixtures/migration-rules';

const endpoints = migrationEmulators();
const controlRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function proof(id, suffix) {
      return get(/databases/$(database)/documents/accessProofs/$(id + suffix)).data.allowed == true;
    }
    match /accessTargets/{id} {
      allow create: if request.auth != null && request.auth.uid == 'BudgetOwner'
        && id in ['left', 'middle', 'six', 'seven']
        && request.resource.data.keys().hasOnly(['value']) && request.resource.data.value == true
        && proof(id, '-0') && proof(id, '-1') && proof(id, '-2')
        && proof(id, '-3') && proof(id, '-4') && proof(id, '-5')
        && (id == 'six' || proof(id, '-6'));
    }
    match /{document=**} { allow read, write: if false; }
  }
}`;
let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: endpoints.projectId, firestore: { host: endpoints.host, port: endpoints.port, rules: controlRules },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const batch = context.firestore().batch();
    for (const id of ['left', 'middle', 'six', 'seven']) for (let index = 0; index < 7; index += 1) {
      batch.set(context.firestore().doc(`accessProofs/${id}-${index}`), { allowed: true });
    }
    await batch.commit();
  });
});
afterAll(async () => {
  try { await environment?.cleanup(); }
  finally {
    const restored = await initializeTestEnvironment({
      projectId: endpoints.projectId, firestore: { host: endpoints.host, port: endpoints.port, rules: candidateRules() },
    });
    await restored.cleanup();
  }
});

describe('emulator transaction access-limit calibration, not production permissions', () => {
  it('accepts exactly twenty distinct rule lookups across three writes, with no operation above seven', async () => {
    const db = environment.authenticatedContext('BudgetOwner').firestore();
    const batch = db.batch();
    for (const id of ['left', 'middle', 'six']) batch.set(db.doc(`accessTargets/${id}`), { value: true });
    await batch.commit();
    await environment.withSecurityRulesDisabled(async context => {
      expect((await context.firestore().collection('accessTargets').get()).size).toBe(3);
    });
  });
  it('denies the same atomic shape with one additional distinct lookup, leaving no partial writes', async () => {
    const db = environment.authenticatedContext('BudgetOwner').firestore();
    const batch = db.batch();
    for (const id of ['left', 'middle', 'seven']) batch.set(db.doc(`accessTargets/${id}`), { value: true });
    await expect(batch.commit()).rejects.toMatchObject({ code: 'permission-denied' });
    await environment.withSecurityRulesDisabled(async context => {
      expect((await context.firestore().collection('accessTargets').get()).empty).toBe(true);
    });
  });
});
