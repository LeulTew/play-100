import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let environment: RulesTestEnvironment;
const member = (uid: string) => ({
  uid,
  displayName: uid,
  avatar: { version: 1, seed: '1'.repeat(32), palette: 'lime' },
  createdAt: new Date(),
  updatedAt: new Date(),
  consentVersion: 1,
  rankCount: 0,
  gameCount: 0,
});
beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-play100',
    firestore: {
      host: '127.0.0.1',
      port: 8188,
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc('_owner/config').set({ uid: 'creator-uid', email: 'owner@example.test' });
    await context.firestore().doc('ownerAccess/status').set({ enabled: true });
    await context.firestore().doc('members/alice').set(member('alice'));
    await context.firestore().doc('members/bob').set(member('bob'));
    await context.firestore().doc('accountLifecycle/alice').set({ state: 'active' });
    await context.firestore().doc('accountLifecycle/bob').set({ state: 'active' });
  });
});
afterAll(async () => {
  await environment.cleanup();
});

describe('managed verified identity and protected creator role', () => {
  it('denies anonymous and unverified access to private profiles and state', async () => {
    for (const db of [
      environment.unauthenticatedContext().firestore(),
      environment.authenticatedContext('alice', { email: 'alice@example.test', email_verified: false }).firestore(),
    ]) {
      await assertFails(db.doc('members/alice').get());
      await assertFails(db.doc('syncHeads/alice').get());
      await assertFails(db.collection('members').limit(20).get());
    }
  });
  it('permits only the matching verified UID and denies all cross-account writes', async () => {
    const alice = environment
      .authenticatedContext('alice', { email: 'alice@example.test', email_verified: true })
      .firestore();
    await assertSucceeds(alice.doc('members/alice').get());
    await assertFails(alice.doc('members/bob').get());
    await assertFails(alice.doc('members/bob').delete());
    await assertFails(alice.doc('members/bob').set(member('alice')));
    await assertFails(alice.doc('_owner/config').get());
    await assertFails(alice.doc('_owner/config').set({ email: 'alice@example.test' }));
    await assertFails(alice.collection('members').limit(20).get());
  });
  it('authorizes the creator from protected configuration, not a forged client admin flag', async () => {
    const creator = environment
      .authenticatedContext('creator-uid', { email: 'owner@example.test', email_verified: true })
      .firestore();
    await assertSucceeds(creator.doc('ownerAccess/status').get());
    await assertSucceeds(creator.collection('members').orderBy('updatedAt', 'desc').limit(20).get());
    await assertFails(creator.collection('members').get());
    await assertFails(creator.doc('syncHeads/alice').get());
    const spoofed = environment
      .authenticatedContext('mallory', { email: 'mallory@example.test', email_verified: true, admin: true })
      .firestore();
    await assertFails(spoofed.doc('ownerAccess/status').get());
    await assertFails(spoofed.doc('members/alice').get());
    const sameEmail = environment
      .authenticatedContext('replacement-uid', { email: 'owner@example.test', email_verified: true })
      .firestore();
    await assertFails(sameEmail.doc('ownerAccess/status').get());
    const renamedOwner = environment
      .authenticatedContext('creator-uid', { email: 'new-owner@example.test', email_verified: true })
      .firestore();
    await assertSucceeds(renamedOwner.doc('ownerAccess/status').get());
    const unverifiedOwner = environment
      .authenticatedContext('creator-uid', { email: 'owner@example.test', email_verified: false })
      .firestore();
    await assertFails(unverifiedOwner.doc('ownerAccess/status').get());
  });
  it('rejects malformed profile fields and avatar descriptors without allowing email/role storage', async () => {
    const alice = environment
      .authenticatedContext('alice', { email: 'alice@example.test', email_verified: true })
      .firestore();
    await assertFails(alice.doc('members/alice').update({ admin: true }));
    await assertFails(alice.doc('members/alice').update({ email: 'a@example.test' }));
    await assertFails(
      alice.doc('members/alice').update({ avatar: { version: 1, url: 'https://evil.invalid/avatar.svg' } }),
    );
    await assertFails(alice.doc('members/alice').update({ displayName: 'a'.repeat(61) }));
    expect((await alice.doc('members/alice').get()).data()?.displayName).toBe('alice');
  });
});
