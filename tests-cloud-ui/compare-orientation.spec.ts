import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { devices, expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type { FriendGroup } from '../src/lib/friend-types';
import { password } from './helpers';

interface Actor {
  label: string;
  email: string;
  uid: string;
  displayName: string;
  verified: boolean;
}
interface FixtureLane {
  lane: string;
  ready: boolean;
  actors: Actor[];
  routes: { compareTwo: string; compareSix: string };
}
interface FixtureManifest {
  status: string;
  lanes: FixtureLane[];
}
interface CompareProbe {
  counts: Record<string, number>;
  groups: FriendGroup[];
  blockGroup: (id: string) => void;
  releaseGroup: (id: string) => void;
  failRead: (peer: string) => void;
  revoke: (peer: string) => void;
  rename: (peer: string, name: string) => void;
  rows: Element[];
}
declare global {
  interface Window {
    compareOrientationProbe: CompareProbe;
  }
}

const fixturePath = process.env.PLAY100_COMPARE_FIXTURE;
const manifest: FixtureManifest | null = fixturePath ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null;
const lane = manifest?.lanes.find((item) => item.lane === 'B');
const origin = process.env.PLAY100_COMPARE_ORIGIN ?? 'http://127.0.0.1:4199';
test.skip(!fixturePath, 'Needs the verified, allocated lane-B emulator fixture; never creates or resets accounts.');
test.use({ baseURL: origin, trace: 'off', serviceWorkers: 'block' });
test.setTimeout(90_000);

function fixture() {
  if (
    !['http://127.0.0.1:4187', 'http://127.0.0.1:4199'].includes(origin) ||
    manifest?.status !== 'READY' ||
    !lane?.ready ||
    lane.actors.length !== 6 ||
    lane.actors.some((actor) => !actor.verified)
  ) {
    throw new Error(
      'Use only the verified six-actor B cohort on the allocated primary4187 or worker4199 loopback app.',
    );
  }
  const owner = lane.actors.find((actor) => actor.label === 'B-owner');
  if (!owner) throw new Error('The allocated B owner is missing.');
  return { ...lane, owner, peers: lane.actors.filter((actor) => actor.uid !== owner.uid) };
}

async function guard(context: BrowserContext) {
  fixture();
  const blocked: string[] = [];
  const allowed = (url: URL) =>
    ['127.0.0.1', 'localhost'].includes(url.hostname) && [new URL(origin).port, '8188', '9199'].includes(url.port);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (allowed(url)) return route.continue();
    blocked.push(url.origin);
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', (route) => {
    const url = new URL(route.url());
    if (allowed(url)) route.connectToServer();
    else {
      blocked.push(url.origin);
      route.close();
    }
  });
  await context.addInitScript(() => {
    Object.defineProperty(globalThis, 'RTCPeerConnection', { configurable: true, value: undefined });
  });
  return blocked;
}

function expectGuarded(blocked: string[]) {
  expect(blocked.filter((host) => host !== 'https://apis.google.com')).toEqual([]);
}

async function login(page: Page, actor = fixture().owner) {
  await page.goto('/account', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.emulator-page-note')).toHaveText(
    'Local emulator preview — no production account or cloud data connection.',
  );
  const config = await page.evaluate(async () => {
    const path = '/src/cloud/firebase-client.ts';
    const client: typeof import('../src/cloud/firebase-client') = await import(path);
    return {
      project: client.firebaseApp.options.projectId,
      host: client.cloudAuth.emulatorConfig?.host,
      port: client.cloudAuth.emulatorConfig?.port,
    };
  });
  expect(config).toEqual({ project: 'demo-play100', host: '127.0.0.1', port: 9199 });
  await page.getByRole('button', { name: 'Use email', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(actor.email);
  await page.locator('.auth-panel input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.locator('.account-heading')).toContainText(actor.email);
  await expect(page.locator('.sync-panel .sync-state')).toHaveText('Saved online', { timeout: 30_000 });
}

async function navigate(page: Page, route: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new Event('play100:navigate'));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, route);
}

async function installProbe(page: Page) {
  await page.evaluate(async () => {
    const storePath = '/src/cloud/friend-store.ts';
    const allPath = '/src/cloud/friend-all-store.ts';
    const shelfPath = '/src/cloud/friend-shelf-store.ts';
    const { FriendStore }: typeof import('../src/cloud/friend-store') = await import(storePath);
    const { FriendAllStore }: typeof import('../src/cloud/friend-all-store') = await import(allPath);
    const { FriendShelfStore }: typeof import('../src/cloud/friend-shelf-store') = await import(shelfPath);
    type Pair = import('../src/lib/friend-types').FriendPair;
    type Person = import('../src/lib/friend-types').FriendIdentity;
    type Head = import('../src/lib/friend-all-transport').FriendAllHead;
    const counts: Record<string, number> = {};
    const count = (key: string) => {
      counts[key] = (counts[key] ?? 0) + 1;
    };
    const pairs = new Map<string, Set<(pair: Pair | null) => void>>();
    const heads = new Map<string, { value: Head | null; next: (head: Head | null) => void }>();
    const people = new Map<string, { value: Person | null; next: (person: Person | null) => void }>();
    const delays = new Map<string, { promise: Promise<void>; release: () => void }>();
    let failPeer: string | null = null;
    const probe: CompareProbe = {
      counts,
      groups: [],
      rows: [],
      blockGroup: (id) => {
        let release = () => {};
        const promise = new Promise<void>((resolve) => {
          release = resolve;
        });
        delays.set(id, { promise, release });
      },
      releaseGroup: (id) => {
        delays.get(id)?.release();
        delays.delete(id);
      },
      failRead: (peer) => {
        const head = heads.get(peer);
        if (!head?.value) throw new Error('No mounted ranking read to fail.');
        failPeer = peer;
        head.next(head.value);
      },
      revoke: (peer) => {
        for (const next of [...(pairs.get(peer) ?? [])]) next(null);
      },
      rename: (peer, name) => {
        const person = people.get(peer);
        if (!person?.value) throw new Error('No mounted identity to rename.');
        person.next({ ...person.value, displayName: name });
      },
    };
    window.compareOrientationProbe = probe;
    const group = FriendStore.prototype.getGroup;
    FriendStore.prototype.getGroup = async function (uid, id) {
      count('groupReads');
      const hold = delays.get(id);
      const value = await group.call(this, uid, id);
      if (hold) await hold.promise;
      return value;
    };
    const groups = FriendStore.prototype.listGroups;
    FriendStore.prototype.listGroups = async function (...args) {
      count('groupLists');
      const value = await groups.apply(this, args);
      probe.groups = value.items;
      return value;
    };
    const relations = FriendStore.prototype.listRelations;
    FriendStore.prototype.listRelations = function (...args) {
      count('relationReads');
      return relations.apply(this, args);
    };
    const save = FriendStore.prototype.saveGroup;
    FriendStore.prototype.saveGroup = function (...args) {
      count('groupWrites');
      return save.apply(this, args);
    };
    const pair = FriendStore.prototype.watchPair;
    FriendStore.prototype.watchPair = function (uid, peer, next, error) {
      count('pairSubscriptions');
      const callbacks = pairs.get(peer) ?? new Set();
      callbacks.add(next);
      pairs.set(peer, callbacks);
      const release = pair.call(this, uid, peer, next, error);
      return () => {
        count('pairReleases');
        callbacks.delete(next);
        release();
      };
    };
    const identity = FriendStore.prototype.watchIdentity;
    FriendStore.prototype.watchIdentity = function (peer, next, error) {
      count('identitySubscriptions');
      const state = { value: null as Person | null, next };
      people.set(peer, state);
      const release = identity.call(
        this,
        peer,
        (value) => {
          state.value = value;
          next(value);
        },
        error,
      );
      return () => {
        count('identityReleases');
        release();
      };
    };
    const settings = FriendStore.prototype.watchSettings;
    FriendStore.prototype.watchSettings = function (...args) {
      count('settingsSubscriptions');
      const release = settings.apply(this, args);
      return () => {
        count('settingsReleases');
        release();
      };
    };
    const legacyHead = FriendStore.prototype.watchShareHead;
    FriendStore.prototype.watchShareHead = function (...args) {
      count('legacySubscriptions');
      const release = legacyHead.apply(this, args);
      return () => {
        count('legacyReleases');
        release();
      };
    };
    const legacy = FriendStore.prototype.ranking;
    FriendStore.prototype.ranking = function (...args) {
      count('legacyReads');
      return legacy.apply(this, args);
    };
    const shelf = FriendShelfStore.prototype.watchConfig;
    FriendShelfStore.prototype.watchConfig = function (...args) {
      count('shelfSubscriptions');
      const release = shelf.apply(this, args);
      return () => {
        count('shelfReleases');
        release();
      };
    };
    const watch = FriendAllStore.prototype.watchHead;
    FriendAllStore.prototype.watchHead = function (peer, kind, next, error) {
      count('allSubscriptions');
      const state = { value: null as Head | null, next };
      if (kind === 'ranking') heads.set(peer, state);
      const release = watch.call(
        this,
        peer,
        kind,
        (value) => {
          state.value = value;
          next(value);
        },
        error,
      );
      return () => {
        count('allReleases');
        release();
      };
    };
    const page = FriendAllStore.prototype.page;
    FriendAllStore.prototype.page = function (peer, kind, ...args) {
      count('pageReads');
      if (peer === failPeer && kind === 'ranking') {
        failPeer = null;
        return Promise.reject(new Error('Synthetic Compare read failure. Refresh this player.'));
      }
      return page.call(this, peer, kind, ...args);
    };
    const exact = FriendAllStore.prototype.exact;
    FriendAllStore.prototype.exact = function (...args) {
      count('exactReads');
      counts.maxExact = Math.max(counts.maxExact ?? 0, args[2].length);
      return exact.apply(this, args);
    };
  });
}

const people = (page: Page) => page.locator('.compare-people-disclosure');
const coverage = (page: Page) => page.locator('.compare-coverage-disclosure');
async function toggle(page: Page, section: 'people' | 'coverage', open: boolean) {
  const element = section === 'people' ? people(page) : coverage(page);
  if (((await element.getAttribute('open')) !== null) !== open) await element.locator('summary').click();
  if (open) await expect(element).toHaveAttribute('open', '');
  else await expect(element).not.toHaveAttribute('open');
}
async function sixReady(page: Page) {
  await expect(page.locator('.compare-people input:checked')).toHaveCount(6);
  await expect(page.locator('.compare-freshness')).toContainText('QA B Legacy Friend: 26 / 26 rankings loaded');
  await expect.poll(() => page.locator('.compare-freshness').textContent()).toMatch(/QA B Friend 1: 25 \/ 26/);
  await expect(page.locator('.friend-matrix tbody tr')).toHaveCount(22);
  await expect(page.locator('.friend-matrix thead th')).toHaveCount(8);
  await expect(page.locator('.compare-coverage-summary')).toHaveText('Loaded games only. Overall totals are unknown.');
}

async function settleScroll(region: Locator) {
  await region.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        let previous = `${element.scrollLeft}:${element.scrollTop}`;
        let stable = 0;
        const deadline = performance.now() + 2000;
        const frame = () => {
          const current = `${element.scrollLeft}:${element.scrollTop}`;
          stable = current === previous ? stable + 1 : 0;
          previous = current;
          if (stable >= 5) resolve();
          else if (performance.now() > deadline) reject(new Error('Native table scrolling did not settle.'));
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

test('restored two/six-person cohorts retain rows, zero/unrated, group draft and mounted loader budget across disclosures', async ({
  page,
  context,
}, info) => {
  const blocked = await guard(context);
  await login(page);
  await installProbe(page);
  await navigate(page, fixture().routes.compareSix);
  await sixReady(page);
  await expect(people(page)).not.toHaveAttribute('open');
  await expect(coverage(page)).not.toHaveAttribute('open');
  const before = await page.locator('.friend-matrix').textContent();
  await expect(page.locator('.friend-matrix')).toContainText('Unrated');
  await expect(page.locator('.friend-matrix')).toContainText('0.0');
  await page.getByLabel('Group name', { exact: true }).fill('Unfinished Compare group draft');
  await page.evaluate(() => {
    window.compareOrientationProbe.rows = [...document.querySelectorAll('.compare-freshness > li')];
  });
  const counts = await page.evaluate(() => ({ ...window.compareOrientationProbe.counts }));
  for (let index = 0; index < 3; index += 1) {
    await toggle(page, 'people', true);
    await toggle(page, 'coverage', true);
    await toggle(page, 'people', false);
    await toggle(page, 'coverage', false);
  }
  const afterToggles = await page.evaluate(() => ({ ...window.compareOrientationProbe.counts }));
  expect(afterToggles).toEqual(counts);
  expect(
    await page.evaluate(() =>
      window.compareOrientationProbe.rows.every(
        (row, index) => row === document.querySelectorAll('.compare-freshness > li')[index],
      ),
    ),
  ).toBe(true);
  expect(await page.locator('.friend-matrix').textContent()).toBe(before);
  await writeFile(
    info.outputPath('disclosure-budget.json'),
    JSON.stringify(
      {
        before: counts,
        after: afterToggles,
        nodesRetained: true,
        rowTextUnchanged: true,
        blockedExternalOrigins: blocked,
      },
      null,
      2,
    ),
  );
  await page.getByLabel('Games', { exact: true }).selectOption('all-shared');
  await page.getByRole('button', { name: 'Next 25', exact: true }).click();
  await page.getByLabel('Search games', { exact: true }).fill('Red');
  await expect(page.getByLabel('Group name', { exact: true })).toHaveValue('Unfinished Compare group draft');
  expect((await page.evaluate(() => window.compareOrientationProbe.counts)).groupWrites ?? 0).toBe(0);
  await page.goto(fixture().routes.compareTwo);
  await expect(page.locator('.compare-people input:checked')).toHaveCount(2);
  await expect(people(page)).not.toHaveAttribute('open');
  await expect(page.locator('.friend-matrix thead th')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.compare-people input:checked')).toHaveCount(2);
  await expect(people(page)).not.toHaveAttribute('open');
  expectGuarded(blocked);
});

test('one-person chooser stays open through second-to-sixth checks and below-two revocation reopens it', async ({
  page,
  context,
}) => {
  const blocked = await guard(context);
  await login(page);
  await installProbe(page);
  await navigate(page, '/compare');
  await expect(people(page)).toHaveAttribute('open', '');
  await expect(page.locator('.compare-people input:checked')).toHaveCount(1);
  for (const peer of fixture().peers) {
    await page.getByLabel(peer.displayName, { exact: true }).check();
    await expect(people(page)).toHaveAttribute('open', '');
  }
  await sixReady(page);
  expect(await page.locator('.compare-people input:not(:checked):enabled').count()).toBe(0);
  await toggle(page, 'people', false);
  await toggle(page, 'people', true);
  await expect(page.locator('.compare-people input:checked')).toHaveCount(6);
  for (const peer of fixture().peers.slice(1)) await page.getByLabel(peer.displayName, { exact: true }).uncheck();
  await toggle(page, 'people', false);
  await toggle(page, 'coverage', false);
  await page.evaluate((peer) => window.compareOrientationProbe.revoke(peer), fixture().peers[0]!.uid);
  await expect(page.locator('.compare-people input:checked')).toHaveCount(1);
  await expect(people(page)).toHaveAttribute('open', '');
  await expect(
    page.getByText('A player is no longer a friend and was removed from this comparison.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Choose at least two people.', { exact: true })).toBeVisible();
  await expect(page.locator('.friend-matrix')).toHaveCount(0);
  expectGuarded(blocked);
});

test('late groups respect early disclosure intent and cannot replace a newer chosen group or name draft', async ({
  page,
  context,
}) => {
  const blocked = await guard(context);
  await login(page);
  await installProbe(page);
  const sixId = new URL(fixture().routes.compareSix, origin).searchParams.get('group')!;
  const twoId = new URL(fixture().routes.compareTwo, origin).searchParams.get('group')!;
  await page.evaluate((id) => window.compareOrientationProbe.blockGroup(id), sixId);
  await navigate(page, fixture().routes.compareSix);
  await expect(page.getByText('Opening comparison group…', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Group name', { exact: true })).toBeDisabled();
  await expect(page.locator('.compare-people')).toHaveCount(0);
  await expect(page.getByText('Choose at least two people.', { exact: true })).toHaveCount(0);
  await toggle(page, 'people', true);
  await page.evaluate((id) => window.compareOrientationProbe.releaseGroup(id), sixId);
  await sixReady(page);
  await expect(people(page)).toHaveAttribute('open', '');
  await page.evaluate((id) => window.compareOrientationProbe.blockGroup(id), twoId);
  await navigate(page, fixture().routes.compareTwo);
  await expect(page.getByText('Opening comparison group…', { exact: true })).toBeVisible();
  const name = await page.evaluate(
    (id) => window.compareOrientationProbe.groups.find((group) => group.id === id)?.name,
    sixId,
  );
  if (!name) throw new Error('The existing six-person group must be available.');
  await page.locator('.friend-groups').getByRole('button', { name, exact: true }).click();
  await sixReady(page);
  await page.getByLabel('Group name', { exact: true }).fill('Keep the newer unsaved draft');
  await page.evaluate((id) => window.compareOrientationProbe.releaseGroup(id), twoId);
  await expect(page.getByLabel('Group name', { exact: true })).toHaveValue('Keep the newer unsaved draft');
  await expect(page.locator('.compare-people input:checked')).toHaveCount(6);
  await expect(people(page)).not.toHaveAttribute('open');
  await page.goto(fixture().routes.compareTwo);
  await expect(page.locator('.compare-people input:checked')).toHaveCount(2);
  await page.goBack();
  await expect(page.locator('.compare-people input:checked')).toHaveCount(6);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, fixture().peers[0]!);
  await page.goto('/compare');
  await expect(page.locator('.compare-people input:checked')).toHaveCount(1);
  await expect(people(page)).toHaveAttribute('open', '');
  await expect(page.getByLabel('Group name', { exact: true })).toHaveValue('');
  await expect(page.locator('.compare-chosen-people')).toContainText(fixture().peers[0]!.displayName);
  await expect(page.locator('.compare-chosen-people')).not.toContainText(fixture().owner.displayName);
  expectGuarded(blocked);
});

test('a failed mounted read opens coverage, stays visibly named when closed, and recovers without remounting peers', async ({
  page,
  context,
}) => {
  const blocked = await guard(context);
  await login(page);
  await installProbe(page);
  await navigate(page, fixture().routes.compareSix);
  await sixReady(page);
  await toggle(page, 'people', false);
  await toggle(page, 'coverage', false);
  const peer = fixture().peers[0]!;
  await page.evaluate((uid) => window.compareOrientationProbe.failRead(uid), peer.uid);
  await expect(coverage(page)).toHaveAttribute('open', '');
  await expect(page.locator('.compare-problems')).toContainText(`${peer.displayName}: Rankings could not load.`);
  await expect(page.getByRole('button', { name: `Refresh ${peer.displayName}`, exact: true })).toBeVisible();
  await toggle(page, 'coverage', false);
  await expect(page.locator('.compare-problems')).toBeVisible();
  await page.getByRole('button', { name: 'Review coverage and recovery', exact: true }).click();
  await expect(coverage(page)).toHaveAttribute('open', '');
  await page.getByRole('button', { name: `Refresh ${peer.displayName}`, exact: true }).click();
  await sixReady(page);
  await expect(page.locator('.compare-problems')).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Load next 25 for ${peer.displayName}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Load next 25 for ${peer.displayName}`, exact: true }).click();
  await expect(page.locator('.compare-freshness')).toContainText(`${peer.displayName}: 26 / 26 rankings loaded`);
  await expect(page.locator('.compare-coverage-summary')).toHaveText('Loaded games only. Overall totals are unknown.');
  expectGuarded(blocked);
});

test('exact-six game filters keep bounded exact reads and unknown whole-cohort totals', async ({
  page,
  context,
}, info) => {
  const blocked = await guard(context);
  await login(page);
  await installProbe(page);
  await navigate(page, fixture().routes.compareSix);
  await sixReady(page);
  await toggle(page, 'people', true);
  const before = await page.evaluate(() => ({ ...window.compareOrientationProbe.counts }));
  await page.evaluate(async (uid) => {
    const filterPath = '/src/lib/comparison-game-filter.ts';
    const collectionPath = '/src/lib/collection.ts';
    const recordPath = '/src/lib/personal-types.ts';
    const filters: typeof import('../src/lib/comparison-game-filter') = await import(filterPath);
    const collection: typeof import('../src/lib/collection') = await import(collectionPath);
    const records: typeof import('../src/lib/personal-types') = await import(recordPath);
    const games = collection
      .parseCollection(await (await fetch('/data/collection.json')).json())
      .games.slice(0, 6)
      .map(records.recordFromGame);
    filters.rememberComparisonGameFilter(filters.createComparisonGameFilter(`account:demo-play100:${uid}`, games));
  }, fixture().owner.uid);
  await expect(page.locator('.compare-freshness')).toContainText('6 chosen games checked');
  await expect(page.locator('.compare-coverage-summary')).toHaveText(
    'Only the chosen games are checked. Overall totals are unknown.',
  );
  await expect(people(page)).toHaveAttribute('open', '');
  const after = await page.evaluate(() => ({ ...window.compareOrientationProbe.counts }));
  expect(after.exactReads! - (before.exactReads ?? 0)).toBe(4);
  expect(after.maxExact).toBe(6);
  expect(after.pageReads).toBe(before.pageReads);
  await expect(page.locator('.friend-matrix tbody tr')).toHaveCount(6);
  await writeFile(
    info.outputPath('exact-read-budget.json'),
    JSON.stringify({ before, after, exactGames: 6, rows: 6, blockedExternalOrigins: blocked }, null, 2),
  );
  expectGuarded(blocked);
});

test('the same saved six-person table fits normal banners at desktop390/320 and keeps both sticky bearings', async ({
  browser,
  isMobile,
}, info) => {
  test.skip(isMobile, 'One genuine desktop and touch matrix, not a duplicate project pass.');
  test.setTimeout(240_000);
  const measurements = [];
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    const touch = viewport.width < 760;
    const context = await browser.newContext({
      ...(touch ? devices['Pixel 7'] : devices['Desktop Chrome']),
      baseURL: origin,
      viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    try {
      const blocked = await guard(context);
      const page = await context.newPage();
      await login(page);
      await installProbe(page);
      await navigate(page, fixture().routes.compareSix);
      await sixReady(page);
      await expect(people(page)).not.toHaveAttribute('open');
      await expect(coverage(page)).not.toHaveAttribute('open');
      const before = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().toJSON();
        return {
          width: innerWidth,
          height: innerHeight,
          coarse: matchMedia('(pointer: coarse)').matches,
          touchPoints: navigator.maxTouchPoints,
          scrollY,
          documentWidth: document.documentElement.scrollWidth,
          navbar: box('.mobile-nav'),
          banner: box('.emulator-page-note'),
          table: box('.comparison-scroll'),
          header: box('.friend-matrix thead'),
          firstGame: box('.friend-matrix tbody th button'),
          firstRow: box('.friend-matrix tbody th'),
          people: document.querySelector('.compare-chosen-people')!.textContent,
          rows: [...document.querySelectorAll('.friend-matrix tbody tr')].map((row) => row.textContent),
          coverage: document.querySelector('.compare-freshness')!.textContent,
        };
      });
      measurements.push({ viewport, before, blocked });
      await writeFile(info.outputPath('compare-geometry.json'), JSON.stringify(measurements, null, 2));
      await page.screenshot({ path: info.outputPath(`compare-six-${viewport.width}.png`) });
      expect(before.width).toBe(viewport.width);
      expect(before.coarse).toBe(touch);
      expect(before.scrollY).toBe(0);
      expect(before.documentWidth).toBe(viewport.width);
      expect(before.banner.height).toBeGreaterThan(0);
      if (touch) expect(before.firstGame.bottom).toBeLessThanOrEqual(before.navbar.top);
      const region = page.getByRole('region', { name: 'Ranking comparison table', exact: true });
      await region.focus();
      await region.press('ArrowRight');
      if (touch) await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await settleScroll(region);
      await expect(region).toBeFocused();
      await page.keyboard.press('PageDown');
      await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await settleScroll(region);
      if (touch) {
        const prior = await region.evaluate((element) => element.scrollLeft);
        const box = await region.boundingBox();
        if (!box) throw new Error('The comparison scroll region must be visible for native touch input.');
        const x = Math.min(viewport.width - 18, box.x + box.width - 12);
        const y = Math.min(before.navbar.top - 30, box.y + box.height / 2);
        const cdp = await context.newCDPSession(page);
        try {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (const distance of [20, 40, 60, 80])
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - distance, y }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(prior);
          await settleScroll(region);
        } finally {
          await cdp.detach();
        }
      }
      await region.evaluate((element) => {
        element.scrollLeft = 520;
        element.scrollTop = 250;
      });
      const scrolled = await page.evaluate(() => {
        const region = document.querySelector('.comparison-scroll')!;
        const corner = document.querySelector('.friend-matrix thead th')!;
        const header = document.querySelector('.friend-matrix thead th:nth-child(4)')!;
        const row = document.querySelector('.friend-matrix tbody tr:nth-child(6) th')!;
        return {
          region: region.getBoundingClientRect().toJSON(),
          corner: corner.getBoundingClientRect().toJSON(),
          header: header.getBoundingClientRect().toJSON(),
          row: row.getBoundingClientRect().toJSON(),
          scrollTop: region.scrollTop,
          scrollLeft: region.scrollLeft,
        };
      });
      expect(Math.abs(scrolled.corner.top - scrolled.region.top - 1)).toBeLessThan(2);
      expect(Math.abs(scrolled.header.top - scrolled.region.top - 1)).toBeLessThan(2);
      expect(Math.abs(scrolled.corner.left - scrolled.region.left)).toBeLessThan(2);
      expect(Math.abs(scrolled.row.left - scrolled.region.left)).toBeLessThan(2);
      expect(scrolled.scrollTop).toBeGreaterThanOrEqual(200);
      if (touch) expect(scrolled.scrollLeft).toBeGreaterThan(0);
      await page.screenshot({ path: info.outputPath(`compare-scroll-${viewport.width}.png`) });
      const peer = fixture().peers[0]!;
      const longName = 'QA B Friend with a deliberately long readable display name';
      await page.evaluate(({ uid, name }) => window.compareOrientationProbe.rename(uid, name), {
        uid: peer.uid,
        name: longName,
      });
      await expect(page.locator('.compare-chosen-people')).toContainText(longName);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await writeFile(info.outputPath(`compare-scroll-${viewport.width}.json`), JSON.stringify(scrolled, null, 2));
      expectGuarded(blocked);
    } finally {
      await context.close();
    }
  }
});
