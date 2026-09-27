import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createAccount, emailFor } from './helpers';

type LifetimeKey = 'scope' | 'enabled' | 'epoch' | 'verified' | 'initialProbe' | 'authGeneration';
declare global {
  interface Window {
    syncReliability: {
      capture: () => void;
      change: (key?: LifetimeKey) => void;
      unmount: () => void;
      finishOld: () => Promise<void>;
      inspect: () => {
        sameLifetime: boolean;
        oldCurrent: boolean;
        restores: number;
        publishes: number;
        error: string;
        stateRevision: number;
      };
    };
    sharingReliability: {
      snapshot: (present: boolean, unrelatedRevision?: boolean) => void;
      settings: (revision: number, selectedIds: string[]) => void;
      remove: () => Promise<void>;
      inspect: () => Promise<{ writes: number; cache: unknown; removed: string[]; error: string }>;
    };
    remoteHead: {
      inspect: () => Promise<{
        status: string;
        base: number;
        dirty: boolean;
        generation: string | null;
        published: string;
        records: number;
        uploads: number;
        downloads: number;
      }>;
    };
  }
}

async function mountSync(page: Page) {
  await page.goto('/data-use');
  await page.evaluate(async () => {
    const hookPath = '/src/cloud/useCloudSync.ts';
    const hook: typeof import('../src/cloud/useCloudSync') = await import(hookPath);
    const clientPath = '/src/cloud/firebase-client.ts';
    const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
    const libraryPath = '/src/lib/scoped-library.ts';
    const library: typeof import('../src/lib/scoped-library') = await import(libraryPath);
    const storePath = '/src/cloud/cloud-store.ts';
    const store: typeof import('../src/cloud/cloud-store') = await import(storePath);
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
    await client.cloudAuth.authStateReady();
    const uid = client.cloudAuth.currentUser?.uid;
    if (!uid) throw new Error('The synthetic account is missing.');
    const scope = `account:demo-play100:${uid}` as const;
    const initial = await library.loadScopedLibrary(scope);
    if (!library.isInitialAccountCache(initial)) throw new Error('The fixture must start without saving consent.');
    store.CloudStore.prototype.watch = () => () => {};
    const restores: Array<{ current: () => boolean; finish: () => void; done: Promise<void> }> = [];
    let publishes = 0;
    const restore = (_store: import('../src/cloud/cloud-store').CloudStore, current: () => boolean) => {
      let finish: (() => void) | undefined;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      if (!finish) throw new Error('The deferred restoration did not start.');
      const done = pending.then(() => {
        if (current()) publishes += 1;
      });
      restores.push({ current, finish, done });
      return done;
    };
    let captured: ((cause: unknown) => void) | undefined;
    function Harness() {
      const [config, setConfig] = React.useState({
        scope: scope as import('../src/lib/cloud-types').LibraryScope | null,
        snapshot: initial,
        verified: true,
        initialProbe: true,
        authGeneration: 1,
      });
      const api = hook.useCloudSync(
        config.scope,
        config.snapshot,
        config.verified,
        config.initialProbe ? restore : undefined,
        config.authGeneration,
      );
      window.syncReliability = {
        capture: () => {
          captured = api.reportProfileError;
        },
        unmount: () => root.unmount(),
        change: (key) =>
          setConfig((old) => {
            switch (key) {
              case 'scope':
                return { ...old, scope: null };
              case 'enabled':
                return { ...old, snapshot: { ...old.snapshot, sync: { ...old.snapshot.sync, enabled: true } } };
              case 'epoch':
                return { ...old, snapshot: { ...old.snapshot, sync: { ...old.snapshot.sync, epoch: 1 } } };
              case 'verified':
                return { ...old, verified: false };
              case 'initialProbe':
                return { ...old, initialProbe: false };
              case 'authGeneration':
                return { ...old, authGeneration: old.authGeneration + 1 };
              default:
                return {
                  ...old,
                  snapshot: {
                    ...old.snapshot,
                    state: { ...old.snapshot.state, revision: old.snapshot.state.revision + 1 },
                  },
                };
            }
          }),
        finishOld: async () => {
          const old = restores[0];
          if (!old || !captured) throw new Error('Capture the pending restore first.');
          captured(new Error('Stale profile failure'));
          old.finish();
          await old.done;
        },
        inspect: () => ({
          sameLifetime: captured === api.reportProfileError,
          oldCurrent: restores[0]?.current() ?? false,
          restores: restores.length,
          publishes,
          error: api.error,
          stateRevision: config.snapshot.state.revision,
        }),
      };
      return React.createElement('output', { id: 'sync-reliability' }, api.status);
    }
    const container = document.createElement('div');
    document.body.append(container);
    const root = DOM.createRoot(container);
    root.render(React.createElement(Harness));
  });
  await expect.poll(() => page.evaluate(() => window.syncReliability?.inspect().restores)).toBe(1);
}

test('sync lifetime retains ordinary edits and invalidates delayed work at every ownership or consent boundary', async ({
  page,
}) => {
  await createAccount(page, emailFor('sync-lifetime'));
  for (const key of ['scope', 'enabled', 'epoch', 'verified', 'initialProbe', 'authGeneration'] as const) {
    await test.step(key, async () => {
      await mountSync(page);
      const before = await page.evaluate(() => window.syncReliability.inspect().stateRevision);
      await page.evaluate(() => {
        window.syncReliability.capture();
        window.syncReliability.change();
      });
      await expect
        .poll(() => page.evaluate(() => window.syncReliability.inspect()))
        .toMatchObject({ sameLifetime: true, oldCurrent: true, restores: 1, stateRevision: before + 1 });
      await page.evaluate((changed) => window.syncReliability.change(changed), key);
      await expect
        .poll(() => page.evaluate(() => window.syncReliability.inspect()))
        .toMatchObject({ sameLifetime: false, oldCurrent: false });
      await page.evaluate(() => window.syncReliability.finishOld());
      expect(await page.evaluate(() => window.syncReliability.inspect())).toMatchObject({ publishes: 0, error: '' });
    });
  }
  await mountSync(page);
  await page.evaluate(() => {
    window.syncReliability.capture();
    window.syncReliability.unmount();
  });
  expect(await page.evaluate(() => window.syncReliability.inspect().oldCurrent)).toBe(false);
  await page.evaluate(() => window.syncReliability.finishOld());
  expect(await page.evaluate(() => window.syncReliability.inspect())).toMatchObject({ publishes: 0, error: '' });
});

// Mounts useCloudSync on this account's enabled, unsaved device copy while a newer online head arrives, as when another
// tab or window of the account saved first. That head holds exactly this library, or a different one.
async function mountRemoteHead(page: Page, identical: boolean) {
  await page.goto('/data-use');
  await page.evaluate(async (identical) => {
    const hookPath = '/src/cloud/useCloudSync.ts';
    const hook: typeof import('../src/cloud/useCloudSync') = await import(hookPath);
    const accountPath = '/src/hooks/useAccountLibrary.ts';
    const account: typeof import('../src/hooks/useAccountLibrary') = await import(accountPath);
    const clientPath = '/src/cloud/firebase-client.ts';
    const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
    const libraryPath = '/src/lib/scoped-library.ts';
    const library: typeof import('../src/lib/scoped-library') = await import(libraryPath);
    const personalPath = '/src/lib/personal-library.ts';
    const personal: typeof import('../src/lib/personal-library') = await import(personalPath);
    const transportPath = '/src/lib/snapshot-transport.ts';
    const transport: typeof import('../src/lib/snapshot-transport') = await import(transportPath);
    const storePath = '/src/cloud/cloud-store.ts';
    const store: typeof import('../src/cloud/cloud-store') = await import(storePath);
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
    await client.cloudAuth.authStateReady();
    const uid = client.cloudAuth.currentUser?.uid;
    if (!uid) throw new Error('The synthetic account is missing.');
    const scope = `account:demo-play100:${uid}` as const;
    type SyncHead = import('../src/lib/cloud-types').SyncHead;
    const empty = personal.emptyPersonalLibrary();
    let copy = await library.loadScopedLibrary(scope);
    if (!copy.sync.enabled) {
      const connected: SyncHead = {
        format: 1,
        epoch: 1,
        revision: 0,
        enabled: true,
        deleted: false,
        current: null,
        previous: null,
        updatedAt: Date.now(),
      };
      await library.connectScopedLibrary(scope, empty, connected, 'Head fixture', false, {
        localRevision: copy.state.revision,
        epoch: copy.sync.epoch,
        enabled: copy.sync.enabled,
      });
    }
    const label = identical ? 'identical' : 'different';
    const record: import('../src/lib/personal-types').LibraryRecord = {
      id: `manual:${label}`,
      source: 'manual',
      sourceId: label,
      sourceUrl: null,
      title: `Remote head ${label} fixture`,
      year: null,
      collectionRank: null,
      studio: null,
      genre: null,
    };
    copy = await library.commitScopedAction(scope, { type: 'rate-game', record, score: 7 });
    const published = await transport.packLibrary(identical ? copy.state : empty);
    const newer: SyncHead = {
      format: 1,
      epoch: copy.sync.epoch,
      revision: copy.sync.baseRemoteRevision + 1,
      enabled: true,
      deleted: false,
      current: published.manifest,
      previous: null,
      updatedAt: Date.now(),
    };
    let uploads = 0;
    let downloads = 0;
    // The newer head reaches both the head listener and the sync read; no upload or download may decide the outcome.
    store.CloudStore.prototype.head = async () => newer;
    store.CloudStore.prototype.watch = (onHead) => {
      const timer = setTimeout(() => onHead(newer));
      return () => clearTimeout(timer);
    };
    store.CloudStore.prototype.upload = async () => {
      uploads += 1;
      throw new Error('No upload is expected while a newer head is pending.');
    };
    store.CloudStore.prototype.download = async () => {
      downloads += 1;
      throw new Error('No download is expected for an unsaved device copy.');
    };
    const current = () => true;
    function Harness() {
      const { snapshot } = account.useAccountLibrary(scope, 'auto', current);
      const api = hook.useCloudSync(scope, snapshot, true, undefined, 1);
      window.remoteHead = {
        inspect: async () => {
          const saved = await library.loadScopedLibrary(scope);
          return {
            status: api.status,
            base: saved.sync.baseRemoteRevision,
            dirty: saved.sync.dirty,
            generation: saved.sync.remoteGeneration,
            published: published.manifest.generation,
            records: Object.keys(saved.state.records).length,
            uploads,
            downloads,
          };
        },
      };
      return React.createElement('output', { id: 'remote-head' }, api.status);
    }
    const container = document.createElement('div');
    document.body.append(container);
    DOM.createRoot(container).render(React.createElement(Harness));
  }, identical);
}

test('a newer online copy of exactly the unsaved library is recorded as saved, and a different one needs a choice', async ({
  page,
}) => {
  await createAccount(page, emailFor('sync-remote-head'));
  await mountRemoteHead(page, true);
  await expect(page.locator('#remote-head')).toHaveText('saved');
  const identical = await page.evaluate(() => window.remoteHead.inspect());
  expect(identical).toMatchObject({ base: 1, dirty: false, records: 1, uploads: 0, downloads: 0 });
  expect(identical.generation).toBe(identical.published);
  await mountRemoteHead(page, false);
  await expect(page.locator('#remote-head')).toHaveText('conflict');
  expect(await page.evaluate(() => window.remoteHead.inspect())).toMatchObject({
    base: 1,
    dirty: true,
    records: 2,
    uploads: 0,
    downloads: 0,
  });
});

async function mountSharing(page: Page) {
  await page.goto('/data-use');
  await page.evaluate(async () => {
    const hookPath = '/src/cloud/useFriendSharing.ts';
    const hook: typeof import('../src/cloud/useFriendSharing') = await import(hookPath);
    const clientPath = '/src/cloud/firebase-client.ts';
    const client: typeof import('../src/cloud/firebase-client') = await import(clientPath);
    const libraryPath = '/src/lib/scoped-library.ts';
    const library: typeof import('../src/lib/scoped-library') = await import(libraryPath);
    const storePath = '/src/cloud/friend-store.ts';
    const store: typeof import('../src/cloud/friend-store') = await import(storePath);
    const dbPath = '/src/lib/personal-db.ts';
    const db: typeof import('../src/lib/personal-db') = await import(dbPath);
    const cachePath = '/src/lib/friend-selection-cache.ts';
    const cache: typeof import('../src/lib/friend-selection-cache') = await import(cachePath);
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
    await client.cloudAuth.authStateReady();
    const uid = client.cloudAuth.currentUser?.uid;
    if (!uid) throw new Error('The synthetic account is missing.');
    const scope = `account:demo-play100:${uid}` as const;
    const record: import('../src/lib/personal-types').LibraryRecord = {
      id: 'manual:reliability',
      source: 'manual',
      sourceId: 'reliability',
      sourceUrl: null,
      title: 'Selection fixture',
      year: null,
      collectionRank: null,
      studio: null,
      genre: null,
    };
    let current = await library.commitScopedAction(scope, { type: 'rate-game', record, score: 7 });
    const settings: import('../src/lib/friend-types').FriendSettings = {
      format: 1,
      enabled: false,
      deleted: false,
      selectedIds: [record.id],
      epoch: 1,
      revision: 1,
      updatedAt: 1,
    };
    store.FriendStore.prototype.settings = async () => settings;
    const originalPut = IDBObjectStore.prototype.put;
    let writes = 0;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === `friends-selection:v1:${scope}`) writes += 1;
      return originalPut.call(this, value, key);
    };
    function Harness() {
      const [snapshot, setSnapshot] = React.useState<import('../src/lib/cloud-types').ScopedLibrary | null>(null);
      const api = hook.useFriendSharing(uid, scope, snapshot, true, [], false, 1, true);
      window.sharingReliability = {
        snapshot: (present, unrelatedRevision = false) => {
          if (unrelatedRevision)
            current = { ...current, state: { ...current.state, revision: current.state.revision + 1 } };
          setSnapshot(present ? { ...current } : null);
        },
        settings: (revision, selectedIds) => api.acceptSettings({ ...settings, revision, selectedIds }),
        remove: async () => {
          current = await library.commitScopedAction(scope, { type: 'remove-ranking', ids: [record.id] });
          setSnapshot(current);
        },
        inspect: async () => {
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const value = await db.friendSelectionStorageTransaction(scope, (value) => value);
          return {
            writes,
            cache: value ?? null,
            removed: [...(await cache.pendingFriendRemovals(scope))],
            error: api.error,
          };
        },
      };
      return React.createElement('output', { id: 'sharing-reliability' }, api.ready ? 'ready' : 'waiting');
    }
    const container = document.createElement('div');
    document.body.append(container);
    DOM.createRoot(container).render(React.createElement(Harness));
  });
  await expect(page.locator('#sharing-reliability')).toHaveText('ready');
}

test('sharing cache initializes current settings when a snapshot arrives without tracking unrelated state revisions', async ({
  page,
}) => {
  await createAccount(page, emailFor('sharing-init'));
  await mountSharing(page);
  expect(await page.evaluate(() => window.sharingReliability.inspect())).toMatchObject({ writes: 0, cache: null });
  await page.evaluate(() => window.sharingReliability.settings(2, ['manual:latest']));
  expect(await page.evaluate(() => window.sharingReliability.inspect())).toMatchObject({ writes: 0, cache: null });
  await page.evaluate(() => window.sharingReliability.snapshot(true));
  await expect
    .poll(() => page.evaluate(() => window.sharingReliability.inspect()))
    .toMatchObject({ writes: 1, cache: { revision: 2, selected: ['manual:latest'] } });
  await page.evaluate(() => window.sharingReliability.snapshot(true, true));
  expect(await page.evaluate(() => window.sharingReliability.inspect())).toMatchObject({
    writes: 1,
    cache: { revision: 2 },
  });
  await page.evaluate(() => window.sharingReliability.snapshot(false));
  expect(await page.evaluate(() => window.sharingReliability.inspect())).toMatchObject({ writes: 1 });
  await page.evaluate(() => window.sharingReliability.snapshot(true));
  await expect
    .poll(() => page.evaluate(() => window.sharingReliability.inspect()))
    .toMatchObject({ writes: 2, cache: { revision: 2 }, error: '' });
});

test('sharing settings revision and selected IDs refresh without clearing private removal markers', async ({
  page,
}) => {
  await createAccount(page, emailFor('sharing-journal'));
  await mountSharing(page);
  await page.evaluate(() => window.sharingReliability.snapshot(true));
  await expect.poll(() => page.evaluate(() => window.sharingReliability.inspect())).toMatchObject({ writes: 1 });
  await page.evaluate(() => window.sharingReliability.remove());
  await expect
    .poll(() => page.evaluate(() => window.sharingReliability.inspect()))
    .toMatchObject({ writes: 2, removed: ['manual:reliability'] });
  await page.evaluate(() => window.sharingReliability.settings(2, ['manual:reliability']));
  await expect
    .poll(() => page.evaluate(() => window.sharingReliability.inspect()))
    .toMatchObject({ writes: 4, cache: { revision: 2 }, removed: ['manual:reliability'] });
  await page.evaluate(() => window.sharingReliability.settings(2, ['manual:reliability', 'manual:second']));
  await expect
    .poll(() => page.evaluate(() => window.sharingReliability.inspect()))
    .toMatchObject({
      writes: 6,
      cache: { revision: 2, selected: ['manual:reliability', 'manual:second'] },
      removed: ['manual:reliability'],
      error: '',
    });
});
