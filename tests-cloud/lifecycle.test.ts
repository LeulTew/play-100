import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let environment: RulesTestEnvironment;
beforeAll(async () => { environment = await initializeTestEnvironment({ projectId: 'demo-play100', firestore: { host: '127.0.0.1', port: 8188, rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => { await environment.clearFirestore(); });
afterAll(async () => { await environment.cleanup(); });

describe('unused registration cancellation without weakening content verification', () => {
  it('lets only the matching signed-in unverified registration create a content-free cancellation marker', async () => {
    const user = environment.authenticatedContext('typo-user', { email: 'typo@example.test', email_verified: false }).firestore();
    await assertSucceeds(user.doc('accountLifecycle/typo-user').set({ state: 'cancelled' }));
    await assertFails(user.doc('accountLifecycle/typo-user').update({ state: 'active' }));
    await assertFails(user.doc('accountLifecycle/another-user').set({ state: 'cancelled' }));
    await assertFails(user.doc('members/typo-user').get());
    expect((await user.doc('accountLifecycle/typo-user').get()).data()).toEqual({ state: 'cancelled' });
  });
  it('denies unused-registration cancellation if any online activity was already reserved', async () => {
    await environment.withSecurityRulesDisabled(async (context) => { await context.firestore().doc('accountLifecycle/existing-user').set({ state: 'active' }); });
    const user = environment.authenticatedContext('existing-user', { email: 'existing@example.test', email_verified: false }).firestore();
    await assertFails(user.doc('accountLifecycle/existing-user').set({ state: 'cancelled' }));
  });
  it('serializes cancellation versus a verified writer and never allows both reservations', async () => {
    const unverified = environment.authenticatedContext('racing-user', { email: 'racing@example.test', email_verified: false }).firestore();
    const verified = environment.authenticatedContext('racing-user', { email: 'racing@example.test', email_verified: true }).firestore();
    const results = await Promise.allSettled([
      unverified.doc('accountLifecycle/racing-user').set({ state: 'cancelled' }),
      verified.doc('accountLifecycle/racing-user').set({ state: 'active' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
  it('never gives anonymous clients a cancellation or member-list permission', async () => {
    const guest = environment.unauthenticatedContext().firestore();
    await assertFails(guest.doc('accountLifecycle/someone').set({ state: 'cancelled' }));
    await assertFails(guest.collection('accountLifecycle').limit(20).get());
  });
});
