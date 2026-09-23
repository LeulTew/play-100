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

  it.each([
    ['A'.repeat(28), 'B'.repeat(28)],
    ['reporter-demo', 'target-demo'],
  ])('allows delimiter-safe reporter %s to read and create only its own report', async (reporterUid, targetUid) => {
    await seed({
      [`accountLifecycle/${reporterUid}`]: { state: 'active' },
      [`publicProfiles/${targetUid}`]: { uid: targetUid, published: true, hidden: false },
    });
    const ref = user(reporterUid).doc(`reports/${targetUid}_${reporterUid}`);
    await assertSucceeds(ref.get());
    const db = user(reporterUid);
    const create = db.batch();
    create.set(db.doc(`reports/${targetUid}_${reporterUid}`), {
      reporterUid, targetUid, reason: 'Fixture report', status: 'open', createdAt: serverTimestamp(), counted: true,
    });
    create.set(db.doc(`accountQuotas/${reporterUid}/limits/reports`), { count: 1, revision: 1, lastReport: `${targetUid}_${reporterUid}` });
    await assertSucceeds(create.commit());
    await assertSucceeds(ref.get());
  });

  it.each([
    ['Reporter_Custom', 'Bob'],
    ['Alice', 'Target_Custom'],
  ])('fails closed on report creation for ambiguous UID pair %s and %s', async (reporterUid, targetUid) => {
    await seed({
      [`accountLifecycle/${reporterUid}`]: { state: 'active' },
      [`publicProfiles/${targetUid}`]: { uid: targetUid, published: true, hidden: false },
    });
    const ref = user(reporterUid).doc(`reports/${targetUid}_${reporterUid}`);
    await expect(ref.get()).rejects.toMatchObject({ code: 'permission-denied' });
    await assertFails(ref.set({
      reporterUid, targetUid, reason: 'Fixture report', status: 'open', createdAt: serverTimestamp(),
    }));
  });

  it('never attributes an existing ambiguous legacy ID to another reporter segment', async () => {
    await seed({
      'reports/Target_Alice_Bob': {
        reporterUid: 'Alice_Bob', targetUid: 'Target', reason: 'Legacy fixture', status: 'open', createdAt: Timestamp.now(),
      },
    });
    await expect(user('Bob').doc('reports/Target_Alice_Bob').get()).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(user('Bob').doc('reports/Missing_Alice_Bob').get()).rejects.toMatchObject({ code: 'permission-denied' });
    await assertSucceeds(user('Alice_Bob').doc('reports/Target_Alice_Bob').get());
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

  it('does not reveal hidden or missing public profiles to other accounts', async () => {
    await seed({ 'publicProfiles/Bob': { uid: 'Bob', published: false, hidden: true } });
    const outsider = user('Third');
    await expect(outsider.doc('publicProfiles/Bob').get()).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(outsider.doc('publicProfiles/Missing').get()).rejects.toMatchObject({ code: 'permission-denied' });
    await assertSucceeds(user('Bob').doc('publicProfiles/Bob').get());
    await assertSucceeds(user('Missing').doc('publicProfiles/Missing').get());
  });

  it('limits private registry growth to eight while permitting oversized legacy cleanup', async () => {
    const ids = Array.from({ length: 10 }, () => crypto.randomUUID());
    await seed({
      'syncHeads/Alice': { enabled: true, deleted: false, epoch: 1, revision: 0, current: null, previous: null },
      'accounts/Alice/metadata/registry': { ids: ids.slice(0, 8), revision: 1 },
    });
    const db = user('Alice');
    const manifest = { format: 1, generation: ids[8], digest: 'a'.repeat(64), bytes: 1, chunks: ['a'.repeat(64)] };
    const growth = db.batch();
    growth.set(db.doc(`accounts/Alice/generations/${ids[8]}`), { private: manifest, ranking: manifest, epoch: 1, status: 'staging', createdAt: serverTimestamp() });
    growth.update(db.doc('accounts/Alice/metadata/registry'), { ids: ids.slice(0, 9), revision: 2 });
    await assertFails(growth.commit());
    await seed({
      'accounts/Alice/metadata/registry': { ids, revision: 1 },
      [`accounts/Alice/generations/${ids[9]}`]: {
        private: { ...manifest, generation: ids[9] }, ranking: { ...manifest, generation: ids[9] },
        epoch: 1, status: 'deleting', createdAt: Timestamp.now(),
      },
    });
    await assertSucceeds(db.doc(`accounts/Alice/generations/${ids[9]}`).update({ released: 2 }));
    const shrink = db.batch();
    shrink.delete(db.doc(`accounts/Alice/generations/${ids[9]}`));
    shrink.update(db.doc('accounts/Alice/metadata/registry'), { ids: ids.slice(0, 9), revision: 2 });
    await assertSucceeds(shrink.commit());
  });

  it('requires atomic public registry enrollment and refuses a fifth retained generation', async () => {
    await seed({ 'publicControls/Alice': { epoch: 0, hidden: false, deleted: false } });
    const db = user('Alice'); const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const id = crypto.randomUUID(); ids.push(id);
      const batch = db.batch();
      batch.set(db.doc(`publicProfiles/Alice/generations/${id}`), {
        epoch: 0, count: 1, uploaded: 0, status: 'staging', createdAt: serverTimestamp(),
      });
      batch.set(db.doc('publicProfiles/Alice/metadata/registry'), { ids: [...ids], revision: index + 1 });
      if (index < 4) await assertSucceeds(batch.commit());
      else await assertFails(batch.commit());
    }
    await assertFails(db.doc(`publicProfiles/Alice/generations/${crypto.randomUUID()}`).set({
      epoch: 0, count: 1, uploaded: 0, status: 'staging', createdAt: serverTimestamp(),
    }));
  });

  it('requires releasing an old handle in the publication batch and rejects reserved prefixes', async () => {
    const id = crypto.randomUUID();
    const profile = {
      uid: 'Alice', handle: 'previous_games', displayName: 'Alice', avatar, title: 'Games', count: 1, preview: ['Game'],
      generation: id, epoch: 1, published: true, listed: false, hidden: false, creator: false, updatedAt: Timestamp.now(),
    };
    await seed({
      'publicProfiles/Alice': profile, 'handles/previous_games': { uid: 'Alice' },
      'publicControls/Alice': { epoch: 1, hidden: false, deleted: false },
      [`publicProfiles/Alice/generations/${id}`]: { status: 'ready', epoch: 1, uploaded: 1 },
    });
    const db = user('Alice');
    const change = (handle: string, release: boolean) => {
      const batch = db.batch();
      batch.set(db.doc('publicProfiles/Alice'), { ...profile, handle, epoch: 2, updatedAt: serverTimestamp() });
      batch.update(db.doc('publicControls/Alice'), { epoch: 2 });
      batch.set(db.doc(`handles/${handle}`), { uid: 'Alice' });
      if (release) batch.delete(db.doc('handles/previous_games'));
      return batch.commit();
    };
    await assertFails(change('new_games', false));
    for (const handle of ['leul_tew', 'play100_official', 'support_team']) await assertFails(change(handle, true));
    await assertSucceeds(change('new_games', true));
    await seed({ 'handles/hoarded_games': { uid: 'Alice' } });
    await assertFails(environment.unauthenticatedContext().firestore().doc('handles/hoarded_games').get());
    await assertFails(db.doc('handles/hoarded_games').get());
    await assertSucceeds(db.doc('handles/new_games').get());
  });
});
