import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let environment: RulesTestEnvironment;
const avatar = { version: 1, seed: 'a'.repeat(32), palette: 'lime' };
const user = (uid: string, verified = true) =>
  environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: verified }).firestore();
const seed = (entries: Record<string, object>) => environment.withSecurityRulesDisabled(async context => {
  const batch = context.firestore().batch();
  for (const [path, value] of Object.entries(entries)) batch.set(context.firestore().doc(path), value);
  await batch.commit();
});
const identity = (uid: string) => ({ format: 1, uid, displayName: `Private ${uid}`, avatar, revision: 1, updatedAt: Timestamp.now() });
const settings = { format: 1, enabled: false, deleted: false, selection: '', epoch: 1, revision: 1, updatedAt: Timestamp.now() };
const pair = (from: string, state: string, updatedAt = Timestamp.now()) => ({
  format: 1, a: 'Alice', b: 'Bob', participants: ['Alice', 'Bob'], from, state, epoch: 1,
  inviteSlot: null, createdAt: Timestamp.fromMillis(1), updatedAt,
});

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-play100', firestore: { host: '127.0.0.1', port: 8188, rules: readFileSync('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await seed({
    '_owner/config': { uid: 'Owner', email: 'Owner@example.test' },
    'accountLifecycle/Alice': { state: 'active' }, 'accountLifecycle/Bob': { state: 'active' },
    'friendSettings/Alice': settings, 'friendSettings/Bob': settings,
    'friendIdentities/Alice': identity('Alice'), 'friendIdentities/Bob': identity('Bob'),
    'publicProfiles/Alice': { published: true, hidden: false, uid: 'Alice' },
    'publicProfiles/Bob': { published: true, hidden: false, uid: 'Bob' },
  });
});
afterAll(async () => { await environment.cleanup(); });

describe('S3 report and friendship boundaries', () => {
  it('returns permission-denied to a third party for both missing and existing predictable report IDs', async () => {
    const outsider = user('Third');
    await expect(outsider.doc('reports/Bob_Alice').get()).rejects.toMatchObject({ code: 'permission-denied' });
    await assertSucceeds(user('Alice').doc('reports/Bob_Alice').get());
    await seed({ 'reports/Bob_Alice': { reporterUid: 'Alice', targetUid: 'Bob', reason: 'Fixture', status: 'open', createdAt: Timestamp.now() } });
    await expect(outsider.doc('reports/Bob_Alice').get()).rejects.toMatchObject({ code: 'permission-denied' });
    await assertSucceeds(user('Alice').doc('reports/Bob_Alice').get());
    await assertSucceeds(user('Owner').doc('reports/Bob_Alice').get());
    await assertFails(user('Alice').doc('reports/Bob_Third_Alice').get());
  });

  it('keeps a cancelled lifecycle immutable and blocks content even after email verification', async () => {
    await assertSucceeds(user('Cancelled', false).doc('accountLifecycle/Cancelled').set({ state: 'cancelled' }));
    const verified = user('Cancelled');
    expect((await verified.doc('accountLifecycle/Cancelled').get()).data()).toEqual({ state: 'cancelled' });
    await assertFails(verified.doc('accountLifecycle/Cancelled').update({ state: 'active' }));
    await assertFails(verified.doc('accountLifecycle/Cancelled').delete());
    await assertFails(verified.doc('members/Cancelled').set({
      uid: 'Cancelled', displayName: 'Verified', avatar, consentVersion: 1, rankCount: 0, gameCount: 0,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(verified.doc('friendSettings/Cancelled').set({ ...settings, updatedAt: serverTimestamp() }));
    await assertFails(verified.doc('publicControls/Cancelled').set({ epoch: 0, hidden: false, deleted: false }));
  });

  it.each(['Alice', 'Bob'])('allows only the recipient to read requester %s private identity while pending', async from => {
    const recipient = from === 'Alice' ? 'Bob' : 'Alice';
    await seed({ 'friendPairs/Alice~Bob': pair(from, 'pending') });
    await assertSucceeds(user(recipient).doc(`friendIdentities/${from}`).get());
    await assertFails(user(from).doc(`friendIdentities/${recipient}`).get());
    await assertSucceeds(user(from).doc(`publicProfiles/${recipient}`).get());
    await seed({ 'friendPairs/Alice~Bob': pair(from, 'accepted') });
    await assertSucceeds(user(from).doc(`friendIdentities/${recipient}`).get());
  });

  it('prevents immediate re-request by a declined sender, but allows the decliner to initiate', async () => {
    await seed({ 'friendPairs/Alice~Bob': pair('Alice', 'declined') });
    await assertFails(user('Alice').doc('friendPairs/Alice~Bob').update({
      from: 'Alice', state: 'pending', epoch: 2, updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(user('Bob').doc('friendPairs/Alice~Bob').update({
      from: 'Bob', state: 'pending', epoch: 2, updatedAt: serverTimestamp(),
    }));
  });

  it('uses the enforced server update time for the 30-day cooldown, never a forged client timestamp', async () => {
    await seed({ 'friendPairs/Alice~Bob': pair('Alice', 'declined', Timestamp.fromMillis(Date.now() - 31 * 86400000)) });
    await assertFails(user('Alice').doc('friendPairs/Alice~Bob').update({
      from: 'Alice', state: 'pending', epoch: 2, updatedAt: Timestamp.fromMillis(0),
    }));
    await assertSucceeds(user('Alice').doc('friendPairs/Alice~Bob').update({
      from: 'Alice', state: 'pending', epoch: 2, updatedAt: serverTimestamp(),
    }));
  });
});
