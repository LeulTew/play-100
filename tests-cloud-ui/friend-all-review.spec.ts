import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createAccount, emailFor, enableSync, verifyEmail } from './helpers';

declare global {
  interface Window {
    allReview: {
      rejectReads: () => void;
      allowReads: () => void;
      rejectPending: () => Promise<number>;
      rejectDefault: () => Promise<number>;
      settle: () => Promise<void>;
      deliverGames: () => void;
      failNextStop: () => void;
      editAndAcknowledge: () => Promise<void>;
      refresh: () => Promise<void>;
      stats: () => { publishes: number; stops: number; defaults: number };
    };
  }
}
async function mount(
  page: Page,
  input: { failRead?: boolean; holdDefault?: boolean; lateGames?: boolean; quota?: boolean } = {},
) {
  await page.goto('/data-use');
  await page.evaluate(async (options) => {
    const modulePath = '/src/cloud/useFriendAll.ts';
    const hook: typeof import('../src/cloud/useFriendAll') = await import(modulePath);
    const clientPath = '/src/cloud/firebase-client.ts';
    const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
    await client.cloudAuth.authStateReady();
    const uid = client.cloudAuth.currentUser?.uid;
    if (!uid) throw new Error('The current synthetic account is missing.');
    const loaded = (pathname: string) => {
      const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .findLast((value) => new URL(value).pathname === pathname);
      if (!url) throw new Error(`Loaded dependency missing: ${pathname}`);
      return url;
    };
    const { default: React }: { default: typeof import('react') } = await import(
      loaded('/node_modules/.vite/deps/react.js')
    );
    const { default: DOM }: { default: typeof import('react-dom/client') } = await import(
      loaded('/node_modules/.vite/deps/react-dom_client.js')
    );
    const storeModule: typeof import('../src/cloud/friend-all-store') = await import(
      loaded('/src/cloud/friend-all-store.ts')
    );
    const scopedPath = '/src/lib/scoped-library.ts';
    const scoped: typeof import('../src/lib/scoped-library') = await import(scopedPath);
    const parserPath = '/src/lib/collection.ts';
    const parser: typeof import('../src/lib/collection') = await import(parserPath);
    const summaryPath = '/src/components/FriendSharingSummary.tsx';
    const summary: typeof import('../src/components/FriendSharingSummary') = await import(summaryPath);
    const cloudPath = '/src/cloud/cloud-store.ts';
    const cloud: typeof import('../src/cloud/cloud-store') = await import(cloudPath);
    const games = parser.parseCollection(await (await fetch('/data/collection.json')).json()).games;
    const scope = `account:demo-play100:${uid}` as const;
    const initial = await scoped.loadScopedLibrary(scope);
    const store = new storeModule.FriendAllStore(client.cloudDb);
    if (options.quota) {
      const cooldownPath = '/src/lib/friend-all-work.ts';
      const cooldown: typeof import('../src/lib/friend-all-work') = await import(cooldownPath);
      const policy = await store.policy(uid);
      if (!policy) throw new Error('Expected active fixture policy.');
      await cooldown.saveFriendAllCooldown(scope, {
        version: 2,
        epoch: policy.epoch,
        nextAttemptAt: Date.now() + 60_000,
      });
    }
    // Reads hang until the test rejects them, then fail until it allows them again. The hook's control watches
    // start reads of their own whenever a server snapshot arrives, so a mode that only rejected the pending
    // reads would race the watches' first delivery. 'unset' reads look like a setup that has no controls yet.
    let reads: 'hang' | 'fail' | 'pass' | 'unset' = options.failRead ? 'hang' : options.holdDefault ? 'unset' : 'pass';
    let failStop = false;
    let publishes = 0;
    let stops = 0;
    let defaults = 0;
    let ticks = 0;
    const waiters = new Map<number, () => void>();
    const failures: Array<{ reject: (cause: Error) => void; read: Promise<never> }> = [];
    const heldDefaults: Array<{ reject: (cause: Error) => void; write: Promise<never> }> = [];
    const controls = storeModule.FriendAllStore.prototype.controls;
    const policy = storeModule.FriendAllStore.prototype.setPolicy;
    const publish = storeModule.FriendAllStore.prototype.publish;
    storeModule.FriendAllStore.prototype.controls = function (owner) {
      if (reads === 'hang') {
        let reject: (cause: Error) => void = () => {};
        const read = new Promise<never>((_, fail) => {
          reject = fail;
        });
        failures.push({ reject, read });
        return read;
      }
      if (reads === 'fail') return Promise.reject(new Error('Synthetic initial controls read failed'));
      if (reads === 'unset') return Promise.resolve({ policy: null, ranking: null, shelf: null });
      return controls.call(this, owner);
    };
    storeModule.FriendAllStore.prototype.setPolicy = function (owner, enabled, origin, expected, current) {
      if (!enabled) {
        stops += 1;
        if (failStop) {
          failStop = false;
          return Promise.reject(new Error('Synthetic stop rejected before commit'));
        }
      }
      if (enabled && origin === 'default' && options.holdDefault) {
        defaults += 1;
        let reject: (cause: Error) => void = () => {};
        const write = new Promise<never>((_, fail) => {
          reject = fail;
        });
        heldDefaults.push({ reject, write });
        return write;
      }
      return policy.call(this, owner, enabled, origin, expected, current);
    };
    storeModule.FriendAllStore.prototype.publish = function (...args) {
      publishes += 1;
      return publish.apply(this, args);
    };
    function Harness() {
      const [availableGames, setGames] = React.useState(options.lateGames ? [] : games);
      const [snapshot, setSnapshot] = React.useState(initial);
      const api = hook.useFriendAll(uid, scope, snapshot, true, availableGames, 1);
      const [tick, setTick] = React.useState(0);
      React.useEffect(() => {
        waiters.get(tick)?.();
        waiters.delete(tick);
      }, [tick]);
      window.allReview = {
        rejectReads: () => {
          reads = 'fail';
          failures.splice(0).forEach(({ reject }) => reject(new Error('Synthetic initial controls read failed')));
        },
        allowReads: () => {
          reads = 'pass';
        },
        rejectPending: async () => {
          const pending = failures.splice(0);
          pending.forEach(({ reject }) => reject(new Error('Synthetic late controls read failed')));
          // The hook awaited each read first, so its own handler has run once these settle.
          await Promise.allSettled(pending.map(({ read }) => read));
          return pending.length;
        },
        rejectDefault: async () => {
          // Reads the watches start after this never settle, so a late first snapshot can't take the default again.
          if (reads === 'unset') reads = 'hang';
          const held = heldDefaults.splice(0);
          held.forEach(({ reject }) => reject(new Error('Synthetic default write failed')));
          await Promise.allSettled(held.map(({ write }) => write));
          return held.length;
        },
        // Resolves after a later commit, so any update queued before it has reached the page.
        settle: () =>
          new Promise<void>((resolve) => {
            const next = ++ticks;
            waiters.set(next, resolve);
            setTick(next);
          }),
        deliverGames: () => setGames(games),
        failNextStop: () => {
          failStop = true;
        },
        stats: () => ({ publishes, stops, defaults }),
        refresh: api.refresh,
        editAndAcknowledge: async () => {
          const local = await scoped.commitScopedAction(scope, {
            type: 'rate-game',
            record: {
              id: 'manual:review',
              source: 'manual',
              sourceId: 'review',
              sourceUrl: null,
              title: 'Review fixture',
              year: null,
              collectionRank: null,
              studio: null,
              genre: null,
            },
            score: 8.5,
          });
          const privateStore = new cloud.CloudStore(client.cloudDb, uid!);
          const head = await privateStore.head();
          if (!head) throw new Error('Fixture private source missing.');
          const saved = await privateStore.upload(local.state, head);
          await scoped.acknowledgeScopedUpload(scope, local.sync.dataRevision, saved);
          setSnapshot(await scoped.loadScopedLibrary(scope));
        },
      };
      return React.createElement(summary.FriendSharingSummary, {
        mode: api.eligibility.kind,
        status: api.status,
        error: api.error,
        canEnable: 'canEnable' in api.eligibility && api.eligibility.canEnable,
        enabled: Boolean(api.policy?.enabled),
        onEnable: api.enable,
        onStop: api.stopSharing,
        // The user's Refresh is the retry that finds the service answering again, never an earlier watch delivery.
        onRefresh: () => {
          if (reads === 'fail') reads = 'pass';
          return api.refresh();
        },
      });
    }
    const container = document.createElement('div');
    container.id = 'all-review-harness';
    document.body.append(container);
    DOM.createRoot(container).render(React.createElement(Harness));
  }, input);
  await expect(page.locator('#all-review-harness')).toContainText('sharing');
}
test.beforeEach(async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = emailFor('all-corners');
  await createAccount(page, email);
  await verifyEmail(page, request, email);
  await enableSync(page, 'empty');
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
test('failed initial All controls recover without Refresh once a control watch can read them', async ({ page }) => {
  await mount(page, { failRead: true });
  const surface = page.locator('#all-review-harness');
  await page.evaluate(() => window.allReview.rejectReads());
  await expect(surface).toContainText('Synthetic initial controls read failed');
  await expect(surface.getByRole('button', { name: 'Share all with friends', exact: true })).toHaveCount(0);
  // The controls watch re-reads on reconnection, like on a server snapshot; neither waits for the user.
  await page.evaluate(() => {
    window.allReview.allowReads();
    window.dispatchEvent(new Event('online'));
  });
  await expect(surface).toContainText('Up to date', { timeout: 30000 });
  await expect(surface).not.toContainText('Synthetic initial controls read failed');
});
test('an older controls read that fails after a newer read was accepted leaves the accepted policy', async ({
  page,
}) => {
  await mount(page, { failRead: true });
  const surface = page.locator('#all-review-harness');
  await expect(surface).toContainText('Checking friend sharing…');
  // The first read stays pending while a newer read, started by reconnection, succeeds and is accepted.
  await page.evaluate(() => {
    window.allReview.allowReads();
    window.dispatchEvent(new Event('online'));
  });
  await expect(surface).toContainText('Up to date', { timeout: 30000 });
  expect(await page.evaluate(() => window.allReview.rejectPending())).toBeGreaterThan(0);
  await page.evaluate(() => window.allReview.settle());
  await expect(surface).not.toContainText('Synthetic late controls read failed');
  await expect(surface).toContainText('Up to date');
  await expect(surface.getByRole('button', { name: 'Stop friend sharing', exact: true })).toBeVisible();
});
test('a default write that newer reads left to it still reports its failure', async ({ page }) => {
  await mount(page, { holdDefault: true });
  const surface = page.locator('#all-review-harness');
  await expect.poll(() => page.evaluate(() => window.allReview.stats().defaults)).toBe(1);
  // A newer read finds the default already being written, so it leaves the write to the first read.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(surface).toContainText('Automatic friend sharing is off.');
  expect(await page.evaluate(() => window.allReview.rejectDefault())).toBe(1);
  await expect(surface).toContainText('Synthetic default write failed');
  await expect(surface.getByRole('button', { name: 'Refresh sharing status', exact: true })).toBeVisible();
});
test('a late default write still wakes the publication queue a newer read created', async ({ page }) => {
  await mount(page, { holdDefault: true });
  const surface = page.locator('#all-review-harness');
  await expect.poll(() => page.evaluate(() => window.allReview.stats().defaults)).toBe(1);
  // Newer reads find the account's actual policy and start publication while the default write is still held.
  await page.evaluate(() => {
    window.allReview.allowReads();
    window.dispatchEvent(new Event('online'));
  });
  await expect(surface).toContainText('Sharing all saved games and rankings with friends.');
  // Refresh replaces the read that holds the write, and with it the publication queue, before the write settles.
  await page.evaluate(() => window.allReview.refresh());
  await page.evaluate(() => window.allReview.settle());
  expect(await page.evaluate(() => window.allReview.rejectDefault())).toBe(1);
  await expect(surface).toContainText('Up to date', { timeout: 30000 });
  await expect(surface).not.toContainText('Synthetic default write failed');
});
test('failed Stop refreshes the same active policy and resumes work without replaying Stop; confirmed Stop stays off', async ({
  page,
}) => {
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
  const surface = page.locator('#all-review-harness');
  await expect(surface).toContainText('Continuing later');
  await expect(
    surface.getByText(
      'The online service has reached a limit. Progress is kept, and sharing resumes automatically without starting over.',
      { exact: true },
    ),
  ).toHaveCount(1);
  await expect(surface.getByRole('alert')).toHaveCount(0);
  await expect(surface).not.toContainText('continue later');
  expect((await page.evaluate(() => window.allReview.stats())).publishes).toBe(0);
});
