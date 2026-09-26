import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { managerPair, pairPath, writeManagerDocuments } from './friend-manager-fixtures';
import { createAccount, emailFor, enableSync, expectRestoredSync, signIn, uidFor, verifyEmail } from './helpers';

/**
 * Allocates the verified six-person comparison cohort that compare-orientation.spec.ts reads, in the running local
 * emulators through the cloud-test app: an owner with 51 ranked games, four friends who share all 26 of theirs
 * automatically, one legacy friend who shares a selected ranking, and the owner's two- and six-person groups. Run it
 * with playwright.compare-fixture.config.ts. It writes the manifest named by PLAY100_COMPARE_FIXTURE and never reuses
 * or overwrites one; the manifest holds labels, synthetic emails, UIDs and routes, never a password or token.
 */
const output = process.env.PLAY100_COMPARE_FIXTURE;
const origins = ['http://127.0.0.1:4187', 'http://127.0.0.1:4199'];

interface CohortActor {
  label: string;
  displayName: string;
  number: number;
  legacy: boolean;
  email: string;
  uid: string;
}

function cohort(): CohortActor[] {
  return ['Owner', 'Friend 1', 'Friend 2', 'Friend 3', 'Friend 4', 'Legacy Friend'].map((name, number) => ({
    label: number === 0 ? 'B-owner' : number === 5 ? 'B-legacy' : `B-friend${number}`,
    displayName: `QA B ${name}`,
    number,
    legacy: number === 5,
    email: emailFor(`compare-b${number}`),
    uid: '',
  }));
}

function listed(actor: CohortActor) {
  return { label: actor.label, email: actor.email, uid: actor.uid, displayName: actor.displayName, verified: true };
}

async function isolatedPage(browser: Browser, origin: string) {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const port = new URL(origin).port;
  // Only the app and the local emulators are reachable, so no allocation step can reach another service.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname) && [port, '8188', '9199'].includes(url.port);
    return local ? route.continue() : route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

// Like an account from before automatic sharing: its off friend controls exist before saving is enabled.
async function keepLegacyChoice(page: Page, uid: string) {
  await page.evaluate(async (uid) => {
    const clientPath = '/src/cloud/firebase-client.ts';
    const friendPath = '/src/cloud/friend-store.ts';
    const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
    const friends: typeof import('../src/cloud/friend-store') = await import(friendPath);
    if (client.cloudAuth.currentUser?.uid !== uid) throw new Error('The legacy fixture actor is not signed in.');
    const store = new friends.FriendStore(client.cloudDb);
    if (!(await store.settings(uid))) await store.initialize(uid);
  }, uid);
}

// The owner ranks 49 of The 100, one catalog game and one manual game; each friend ranks the first 25 and the same
// catalog game. Rotating scores include 0 and unrated, and the first two private notes must never be shared.
async function populate(page: Page, actor: CohortActor): Promise<number> {
  return page.evaluate(
    async ({ uid, number }) => {
      const collectionPath = '/src/lib/collection.ts';
      const recordPath = '/src/lib/personal-types.ts';
      const libraryPath = '/src/lib/personal-library.ts';
      const scopedPath = '/src/lib/scoped-library.ts';
      const collection: typeof import('../src/lib/collection') = await import(collectionPath);
      const records: typeof import('../src/lib/personal-types') = await import(recordPath);
      const library: typeof import('../src/lib/personal-library') = await import(libraryPath);
      const scoped: typeof import('../src/lib/scoped-library') = await import(scopedPath);
      type LibraryRecord = import('../src/lib/personal-types').LibraryRecord;
      const games = collection.parseCollection(await (await fetch('/data/collection.json')).json()).games;
      const response = await fetch('/data/discovery/catalog.v1.json');
      const catalog = (await response.json()) as { items: Array<{ record: LibraryRecord }> };
      const shared = catalog.items.find((item) => item.record.id === 'wikidata:Q15408545')?.record;
      if (!shared) throw new Error('The discovery catalog lacks Kingdom Come: Deliverance.');
      const manual: LibraryRecord = {
        id: 'manual:ux-synthetic-shared',
        title: 'Synthetic review game with a deliberately long descriptive title',
        year: 2020,
        studio: 'Synthetic fixture',
        genre: 'Fixture',
        source: 'manual',
        sourceId: 'ux-synthetic-shared',
        sourceUrl: null,
        collectionRank: null,
      };
      const chosen =
        number === 0
          ? [...games.slice(0, 49).map(records.recordFromGame), shared, manual]
          : [...games.slice(0, 25).map(records.recordFromGame), shared];
      const scores = [9.5, 0, null, 8.7, 6.2, 7.4];
      let state = library.emptyPersonalLibrary();
      state = library.applyPersonalAction(state, { type: 'add-ranking', records: chosen });
      for (const [index, record] of chosen.entries())
        state = library.applyPersonalAction(state, {
          type: 'edit-ranking',
          id: record.id,
          score: scores[(index + number) % scores.length],
          note: index < 2 ? `SYNTHETIC PRIVATE NOTE lane B actor ${number}; excluded from shared views.` : '',
        });
      const progress = [
        ['played', 9],
        ['completed', 4],
        ['later', 5],
      ] as const;
      for (const [key, count] of progress)
        state = library.applyPersonalAction(state, {
          type: 'set-progress',
          records: chosen.slice(0, count),
          key,
          value: true,
        });
      state = library.applyPersonalAction(state, {
        type: 'move-item',
        list: 'ranking',
        id: chosen[1]!.id,
        overId: chosen[0]!.id,
      });
      await scoped.restoreScopedLibrary(
        `account:demo-play100:${uid}`,
        { ...state, motion: 'lite' },
        'Synthetic comparison fixture initialization',
      );
      return chosen.length;
    },
    { uid: actor.uid, number: actor.number },
  );
}

// Whether the server copy holds every game and, for an automatic sharer, both shared views are ready with all of them.
async function saved(page: Page, actor: CohortActor, count: number): Promise<boolean> {
  return page.evaluate(
    async ({ uid, count, legacy }) => {
      const clientPath = '/src/cloud/firebase-client.ts';
      const cloudPath = '/src/cloud/cloud-store.ts';
      const allPath = '/src/cloud/friend-all-store.ts';
      const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
      const cloud: typeof import('../src/cloud/cloud-store') = await import(cloudPath);
      const all: typeof import('../src/cloud/friend-all-store') = await import(allPath);
      if (client.cloudAuth.currentUser?.uid !== uid) throw new Error('The fixture actor changed.');
      const store = new cloud.CloudStore(client.cloudDb, uid);
      const head = await store.head();
      const copy = head?.enabled && head.current ? await store.download(head) : null;
      if (Object.keys(copy?.records ?? {}).length !== count || copy?.ranking.length !== count) return false;
      const sharing = new all.FriendAllStore(client.cloudDb);
      const controls = await sharing.controls(uid);
      if (legacy) return controls.policy === null;
      if (!controls.policy?.enabled || controls.policy.origin !== 'default') return false;
      const views = await Promise.all([sharing.head(uid, 'games'), sharing.head(uid, 'ranking')]);
      return views.every((view) => view?.status === 'ready' && view.count === count);
    },
    { uid: actor.uid, count, legacy: actor.legacy },
  );
}

async function shareIdentity(page: Page, actor: CohortActor) {
  await page.evaluate(
    async ({ uid, displayName }) => {
      const clientPath = '/src/cloud/firebase-client.ts';
      const socialPath = '/src/cloud/social-store.ts';
      const friendPath = '/src/cloud/friend-store.ts';
      const actionsPath = '/src/cloud/friend-page-actions.ts';
      const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
      const social: typeof import('../src/cloud/social-store') = await import(socialPath);
      const friends: typeof import('../src/cloud/friend-store') = await import(friendPath);
      const actions: typeof import('../src/cloud/friend-page-actions') = await import(actionsPath);
      const member = await new social.SocialStore(client.cloudDb).member(uid);
      if (!member || !client.cloudAuth.currentUser?.emailVerified)
        throw new Error('The fixture actor is not a verified member.');
      await actions.prepareFriendIdentity(new friends.FriendStore(client.cloudDb), {
        uid,
        verified: true,
        displayName,
        avatar: member.avatar,
      });
    },
    { uid: actor.uid, displayName: actor.displayName },
  );
}

async function prepare(browser: Browser, request: APIRequestContext, origin: string, actor: CohortActor) {
  const { context, page } = await isolatedPage(browser, origin);
  try {
    await createAccount(page, actor.email);
    actor.uid = await uidFor(request, actor.email);
    await verifyEmail(page, request, actor.email);
    if (actor.legacy) await keepLegacyChoice(page, actor.uid);
    await enableSync(page, 'empty');
    const summary = page.locator('.friend-sharing-summary');
    if (actor.legacy) await expect(summary).toContainText('Your previous sharing choice is unchanged.');
    else await expect(summary).toContainText('Up to date', { timeout: 30_000 });
    await page.getByLabel('Name', { exact: true }).fill(actor.displayName);
    await page.getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Name saved.' })).toBeVisible();
    const count = await populate(page, actor);
    await expect.poll(() => saved(page, actor, count), { timeout: 120_000 }).toBe(true);
    await shareIdentity(page, actor);
  } finally {
    await context.close();
  }
}

async function connectFirstFriend(browser: Browser, origin: string, owner: CohortActor, friend: CohortActor) {
  const inviter = await isolatedPage(browser, origin);
  const invitee = await isolatedPage(browser, origin);
  try {
    await signIn(inviter.page, owner.email);
    await expectRestoredSync(inviter.page);
    await signIn(invitee.page, friend.email);
    await expectRestoredSync(invitee.page);
    await inviter.page.goto('/friends');
    await inviter.page.getByRole('button', { name: 'Invite someone', exact: true }).click();
    const input = inviter.page.getByLabel('Invitation link', { exact: true });
    await expect(input).toBeVisible({ timeout: 60_000 });
    const link = await input.inputValue();
    expect(new URL(link).origin).toBe(origin);
    await inviter.page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await invitee.page.goto(link);
    await invitee.page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(invitee.page.getByRole('heading', { name: "You're connected", exact: true })).toBeVisible();
  } finally {
    await inviter.context.close();
    await invitee.context.close();
  }
}

async function shareLegacyRanking(browser: Browser, origin: string, legacy: CohortActor) {
  const { context, page } = await isolatedPage(browser, origin);
  try {
    await signIn(page, legacy.email);
    await expectRestoredSync(page);
    await page.goto('/friends/sharing');
    await expect(
      page.locator('.friends-sharing-page').getByRole('heading', { name: 'Friends sharing', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await page.getByRole('button', { name: 'Preview friends sharing', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Agree & share with friends', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Sharing saved' })).toBeVisible({ timeout: 30_000 });
  } finally {
    await context.close();
  }
}

async function saveGroups(browser: Browser, origin: string, owner: CohortActor, peers: CohortActor[]) {
  const { context, page } = await isolatedPage(browser, origin);
  try {
    await signIn(page, owner.email);
    await expectRestoredSync(page);
    const ids = await page.evaluate(
      async ({ uid, peerUids }) => {
        const clientPath = '/src/cloud/firebase-client.ts';
        const friendPath = '/src/cloud/friend-store.ts';
        const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
        const friends: typeof import('../src/cloud/friend-store') = await import(friendPath);
        if (client.cloudAuth.currentUser?.uid !== uid) throw new Error('The fixture owner is not signed in.');
        const store = new friends.FriendStore(client.cloudDb);
        const two = await store.saveGroup(uid, { name: 'QA B two people', participantUids: [uid, peerUids[0]!] }, 0);
        const six = await store.saveGroup(uid, { name: 'QA B six people', participantUids: [uid, ...peerUids] }, 0);
        return { two: two.id, six: six.id };
      },
      { uid: owner.uid, peerUids: peers.map((peer) => peer.uid) },
    );
    const routes = {
      compareTwo: `/compare?group=${encodeURIComponent(ids.two)}`,
      compareSix: `/compare?group=${encodeURIComponent(ids.six)}`,
    };
    // The cohort is complete once both saved groups open as tables with a column for every chosen person and the
    // legacy friend's selected ranking loads in full.
    await page.goto(routes.compareSix);
    await expect(page.locator('.compare-people input:checked')).toHaveCount(6);
    await expect(page.locator('.friend-matrix thead th')).toHaveCount(8);
    await expect(page.locator('.compare-freshness')).toContainText('QA B Legacy Friend: 26 / 26 rankings loaded');
    await page.goto(routes.compareTwo);
    await expect(page.locator('.compare-people input:checked')).toHaveCount(2);
    await expect(page.locator('.friend-matrix thead th')).toHaveCount(4);
    return routes;
  } finally {
    await context.close();
  }
}

test('allocates the verified six-person comparison cohort', async ({ browser, request, baseURL }) => {
  if (!output) throw new Error('Set PLAY100_COMPARE_FIXTURE to the path of the new manifest to write.');
  if (existsSync(output)) throw new Error(`Refusing to reuse or overwrite ${output}; name a new manifest path.`);
  const origin = baseURL ?? '';
  if (!origins.includes(origin)) throw new Error('Allocate only through the primary 4187 or worker 4199 app.');
  const actors = cohort();
  for (const actor of actors) await prepare(browser, request, origin, actor);
  const owner = actors[0]!;
  const peers = actors.slice(1);
  await connectFirstFriend(browser, origin, owner, peers[0]!);
  // The first friendship goes through a real invitation; the others are accepted local pairs, as in review fixtures.
  const pairs: Record<string, Record<string, unknown>> = {};
  const now = Date.now();
  for (const peer of peers.slice(1)) {
    const updatedAt = now + peer.number * 1000;
    pairs[pairPath(owner.uid, peer.uid)] = managerPair(owner.uid, peer.uid, owner.uid, 'accepted', updatedAt);
  }
  await writeManagerDocuments(request, pairs);
  await shareLegacyRanking(browser, origin, peers[4]!);
  const routes = await saveGroups(browser, origin, owner, peers);
  const manifest = {
    status: 'READY',
    origin,
    allocatedAt: new Date().toISOString(),
    lanes: [{ lane: 'B', ready: true, actors: actors.map(listed), routes }],
  };
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
});
