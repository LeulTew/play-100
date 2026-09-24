import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createAccount, emailFor, enableSync, verifyEmail } from './helpers';

declare global {
  interface Window {
    allReview: {
      rejectReads: () => void; deliverGames: () => void; failNextStop: () => void;
      editAndAcknowledge: () => Promise<void>; refresh: () => Promise<void>; stats: () => { publishes: number; stops: number };
    };
  }
}
async function mount(page: Page, input: { failRead?: boolean; lateGames?: boolean; quota?: boolean } = {}) {
  await page.goto('/data-use');
  await page.evaluate(async options => {
    const modulePath = '/src/cloud/useFriendAll.ts';
    const hook: typeof import('../src/cloud/useFriendAll') = await import(modulePath);
    const clientPath = '/src/cloud/firebase-client.ts';
    const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
    await client.cloudAuth.authStateReady();
    const uid = client.cloudAuth.currentUser?.uid; if (!uid) throw new Error('The current synthetic account is missing.');
    const loaded = (pathname: string) => {
      const url = performance.getEntriesByType('resource').map(entry => entry.name).findLast(value => new URL(value).pathname === pathname);
      if (!url) throw new Error(`Loaded dependency missing: ${pathname}`);
      return url;
    };
    const { default: React }: { default: typeof import('react') } = await import(loaded('/node_modules/.vite/deps/react.js'));
    const { default: DOM }: { default: typeof import('react-dom/client') } = await import(loaded('/node_modules/.vite/deps/react-dom_client.js'));
    const storeModule: typeof import('../src/cloud/friend-all-store') = await import(loaded('/src/cloud/friend-all-store.ts'));
    const scopedPath = '/src/lib/scoped-library.ts'; const scoped: typeof import('../src/lib/scoped-library') = await import(scopedPath);
    const parserPath = '/src/lib/collection.ts'; const parser: typeof import('../src/lib/collection') = await import(parserPath);
    const summaryPath = '/src/components/FriendSharingSummary.tsx'; const summary: typeof import('../src/components/FriendSharingSummary') = await import(summaryPath);
    const cloudPath = '/src/cloud/cloud-store.ts'; const cloud: typeof import('../src/cloud/cloud-store') = await import(cloudPath);
    const games = parser.parseCollection(await (await fetch('/data/collection.json')).json()).games;
    const scope = `account:demo-play100:${uid}` as const; const initial = await scoped.loadScopedLibrary(scope);
    const store = new storeModule.FriendAllStore(client.cloudDb);
    if (options.quota) {
      const cooldownPath = '/src/lib/friend-all-work.ts'; const cooldown: typeof import('../src/lib/friend-all-work') = await import(cooldownPath);
      const policy = await store.policy(uid); if (!policy) throw new Error('Expected active fixture policy.');
      await cooldown.saveFriendAllCooldown(scope, { version: 2, epoch: policy.epoch, nextAttemptAt: Date.now() + 60_000 });
    }
    let blocking = Boolean(options.failRead); let failStop = false; let publishes = 0; let stops = 0;
    const failures: Array<(cause: Error) => void> = [];
    const controls = storeModule.FriendAllStore.prototype.controls;
    const policy = storeModule.FriendAllStore.prototype.setPolicy;
    const publish = storeModule.FriendAllStore.prototype.publish;
    storeModule.FriendAllStore.prototype.controls = function(owner) {
      return blocking ? new Promise((_, reject) => failures.push(reject)) : controls.call(this, owner);
    };
    storeModule.FriendAllStore.prototype.setPolicy = function(owner, enabled, origin, expected, current) {
      if (!enabled) { stops += 1; if (failStop) { failStop = false; return Promise.reject(new Error('Synthetic stop rejected before commit')); } }
      return policy.call(this, owner, enabled, origin, expected, current);
    };
    storeModule.FriendAllStore.prototype.publish = function(...args) { publishes += 1; return publish.apply(this, args); };
    function Harness() {
      const [availableGames, setGames] = React.useState(options.lateGames ? [] : games);
      const [snapshot, setSnapshot] = React.useState(initial);
      const api = hook.useFriendAll(uid, scope, snapshot, true, availableGames, 1);
      window.allReview = {
        rejectReads: () => { blocking = false; failures.splice(0).forEach(reject => reject(new Error('Synthetic initial controls read failed'))); },
        deliverGames: () => setGames(games), failNextStop: () => { failStop = true; }, stats: () => ({ publishes, stops }), refresh: api.refresh,
        editAndAcknowledge: async () => {
          const local = await scoped.commitScopedAction(scope, { type: 'rate-game', record: { id: 'manual:review', source: 'manual', sourceId: 'review', sourceUrl: null, title: 'Review fixture', year: null, collectionRank: null, studio: null, genre: null }, score: 8.5 });
          const privateStore = new cloud.CloudStore(client.cloudDb, uid!); const head = await privateStore.head();
          if (!head) throw new Error('Fixture private source missing.');
          const saved = await privateStore.upload(local.state, head);
          await scoped.acknowledgeScopedUpload(scope, local.sync.dataRevision, saved);
          setSnapshot(await scoped.loadScopedLibrary(scope));
        },
      };
      return React.createElement(summary.FriendSharingSummary, {
        mode: api.eligibility.kind, status: api.status, error: api.error, canEnable: 'canEnable' in api.eligibility && api.eligibility.canEnable,
        enabled: Boolean(api.policy?.enabled), onEnable: api.enable, onStop: api.stopSharing, onRefresh: api.refresh,
      });
    }
    const container = document.createElement('div'); container.id = 'all-review-harness'; document.body.append(container);
    DOM.createRoot(container).render(React.createElement(Harness));
  }, input);
  await expect(page.locator('#all-review-harness')).toContainText('sharing');
}
test.beforeEach(async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = emailFor('all-corners');
  await createAccount(page, email); await verifyEmail(page, request, email); await enableSync(page, 'empty');
  await expect(page.locator('.friend-sharing-summary')).toContainText('Up to date', { timeout: 30000 });
});
test('failed initial All controls remain unknown and recover to the actual enabled policy', async ({ page }) => {
  await mount(page, { failRead: true });
  const surface = page.locator('#all-review-harness');
  await expect(surface).toContainText('Checking friend sharing…');
  await page.evaluate(() => window.allReview.rejectReads());
  await expect(surface).toContainText('Synthetic initial controls read failed');
  await expect(surface).not.toContainText('sharing is off');
  await expect(surface.getByRole('button', { name: 'Share all with friends', exact: true })).toHaveCount(0);
  await surface.getByRole('button', { name: 'Refresh sharing status', exact: true }).click();
  await expect(surface).toContainText('Up to date', { timeout: 30000 });
});
test('failed Stop refreshes the same active policy and resumes work without replaying Stop; confirmed Stop stays off', async ({ page }) => {
  await mount(page);
  const surface = page.locator('#all-review-harness');
  await expect(surface).toContainText('Up to date');
  await page.evaluate(() => window.allReview.failNextStop());
  await surface.getByRole('button', { name: 'Stop friend sharing', exact: true }).click();
  await expect(surface).toContainText('Synthetic stop rejected before commit');
  await surface.getByRole('button', { name: 'Refresh sharing status', exact: true }).click();
  await page.evaluate(() => window.allReview.editAndAcknowledge());
  await expect(surface).toContainText('Up to date', { timeout: 30000 });
  expect((await page.evaluate(() => window.allReview.stats())).stops).toBe(1);
  await surface.getByRole('button', { name: 'Stop friend sharing', exact: true }).click();
  await expect(surface).toContainText('Automatic friend sharing is off.');
  await page.evaluate(() => window.allReview.refresh());
  await expect(surface).toContainText('Automatic friend sharing is off.');
  expect((await page.evaluate(() => window.allReview.stats())).stops).toBe(2);
});
test('late canonical games wake publication without another user event', async ({ page }) => {
  await mount(page, { lateGames: true });
  await page.waitForTimeout(400);
  expect((await page.evaluate(() => window.allReview.stats())).publishes).toBe(0);
  await page.evaluate(() => window.allReview.deliverGames());
  await expect(page.locator('#all-review-harness')).toContainText('Up to date', { timeout: 30000 });
  expect((await page.evaluate(() => window.allReview.stats())).publishes).toBe(2);
});
test('late canonical games do not bypass the persisted quota deadline', async ({ page }) => {
  await mount(page, { lateGames: true, quota: true });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.allReview.deliverGames());
  await expect(page.locator('#all-review-harness')).toContainText('Continuing later');
  expect((await page.evaluate(() => window.allReview.stats())).publishes).toBe(0);
});
