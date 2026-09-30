import assert from 'node:assert/strict';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import type { PersonalLibraryState } from '../src/lib/personal-types';
import type { SwBuild } from './release-sw-inputs';
import { documentInfo, launchProfile, track } from './release-sw-browser';
import { startSwServer } from './release-sw-server';

export const RELEASE6_COMMIT = '129e73eebbf6c8c7eef5fc3eda1d4ab45f8161fe';
export const staleDraft = 'Pending Release 6 note: keep this text if saving fails.';
export const candidateNote = 'Saved by the candidate after the v3 upgrade.';
const removed = 'manual:mixed-removed',
  retained = 'manual:mixed-retained';

export function mixedFixture(): PersonalLibraryState {
  return {
    version: 3,
    revision: 2,
    motion: 'lite',
    progress: {},
    queueOrder: [],
    records: Object.fromEntries(
      [
        [removed, 'Mixed removed'],
        [retained, 'Mixed retained'],
      ].map(([id, title]) => [
        id,
        {
          id,
          title,
          source: 'manual',
          sourceId: id,
          sourceUrl: null,
          collectionRank: null,
          year: 2020,
          studio: null,
          genre: null,
        },
      ]),
    ),
    ranking: [removed, retained].map((id, index) => ({
      id,
      score: 9 - index,
      note: 'Saved before upgrade',
      manualPosition: null,
    })),
  };
}

export interface DatabaseSnapshot {
  version: number;
  rows: [IDBValidKey, unknown][];
}
export interface ConnectionEvent {
  kind: 'open' | 'versionchange' | 'close' | 'error';
  connection: number;
  version: number;
  nextVersion?: number | null;
  error?: string;
}
declare global {
  interface Window {
    __mixedConnections: { db: IDBDatabase; id: number }[];
    __mixedEvents: ConnectionEvent[];
    __mixedBlocker: IDBDatabase;
    __mixedBlockedChanges: number;
  }
}

// Observe native calls without closing connections, suppressing events or changing requests.
export function observeConnections() {
  window.__mixedConnections = [];
  window.__mixedEvents = [];
  // Both originals run only through .call(this, ...) on the instance the patched method receives.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalOpen = IDBFactory.prototype.open,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalClose = IDBDatabase.prototype.close;
  IDBFactory.prototype.open = function (name, version) {
    const request = version === undefined ? originalOpen.call(this, name) : originalOpen.call(this, name, version);
    if (name !== 'play100-personal') return request;
    request.addEventListener('error', () =>
      window.__mixedEvents.push({
        kind: 'error',
        connection: -1,
        version: version ?? 0,
        error: request.error?.name,
      }),
    );
    request.addEventListener('success', () => {
      const db = request.result,
        id = window.__mixedConnections.length;
      window.__mixedConnections.push({ db, id });
      window.__mixedEvents.push({ kind: 'open', connection: id, version: db.version });
      db.addEventListener('versionchange', (event) =>
        window.__mixedEvents.push({
          kind: 'versionchange',
          connection: id,
          version: db.version,
          nextVersion: event.newVersion,
        }),
      );
    });
    return request;
  };
  IDBDatabase.prototype.close = function () {
    originalClose.call(this);
    const observed = window.__mixedConnections.find((row) => row.db === this);
    if (observed) window.__mixedEvents.push({ kind: 'close', connection: observed.id, version: this.version });
  };
}

export async function snapshotDatabase(page: Page, held = false): Promise<DatabaseSnapshot> {
  return page.evaluate(async (held) => {
    const db = held
      ? window.__mixedBlocker
      : await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('play100-personal');
          request.onupgradeneeded = () => {
            request.transaction?.abort();
            reject(new Error('Expected an existing database.'));
          };
          request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
          request.onsuccess = () => resolve(request.result);
        });
    try {
      return await new Promise<DatabaseSnapshot>((resolve, reject) => {
        const tx = db.transaction('library', 'readonly'),
          store = tx.objectStore('library');
        const keys = store.getAllKeys(),
          values = store.getAll();
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB operation failed'));
        tx.oncomplete = () =>
          resolve({ version: db.version, rows: keys.result.map((key, i) => [key, values.result[i]]) });
      });
    } finally {
      if (!held) db.close();
    }
  }, held);
}

async function seed(page: Page, origin: string, hold: boolean) {
  await page.goto(`${origin}/__release-probe/blank`);
  await page.evaluate(
    async ({ state, hold }) => {
      if (location.hostname !== '127.0.0.1' || (await indexedDB.databases()).length)
        throw new Error('Seed requires a fresh owned loopback profile.');
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('play100-personal', 2);
        request.onupgradeneeded = () => request.result.createObjectStore('library');
        request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction('library', 'readwrite');
          tx.objectStore('library').put(state, 'state');
          tx.onabort = () => {
            db.close();
            reject(tx.error ?? new Error('IndexedDB operation failed'));
          };
          tx.oncomplete = () => {
            if (hold) {
              window.__mixedBlocker = db;
              window.__mixedBlockedChanges = 0;
              db.onversionchange = () => {
                window.__mixedBlockedChanges++;
              };
            } else db.close();
            resolve();
          };
        };
      });
    },
    { state: mixedFixture(), hold },
  );
}

async function noteField(page: Page, title: string) {
  const field = page.getByRole('textbox', { name: `Your note for ${title}`, exact: true });
  // The label exists inside the closed details; use its associated control to identify the exact row.
  const textarea = page.getByLabel(`Your note for ${title}`, { exact: true });
  const container = page.locator('.ranking-note').filter({ has: textarea });
  await expect(container).toHaveCount(1);
  if (!(await container.evaluate((element) => element.hasAttribute('open'))))
    await container.locator('summary').click();
  await expect(field).toBeVisible();
  return field;
}

export function assertMixedEvidence(facts: {
  before: DatabaseSnapshot;
  upgraded: DatabaseSnapshot;
  savedByB: DatabaseSnapshot;
  afterOldSave: DatabaseSnapshot;
  events: ConnectionEvent[];
  closedHandleError: string;
  draftBefore: string;
  draftAfter: string;
  saveError: string;
  versionErrorAfterSave: boolean;
}) {
  assert.equal(facts.before.version, 2);
  assert.equal(facts.upgraded.version, 3);
  assert.deepEqual(facts.upgraded.rows, facts.before.rows, 'The upgrade must preserve every saved row.');
  const changed = facts.events.findIndex(
    (event) => event.kind === 'versionchange' && event.version === 2 && event.nextVersion === 3,
  );
  assert.ok(changed >= 0, 'Release 6 did not observe versionchange.');
  assert.ok(
    facts.events
      .slice(changed + 1)
      .some((event) => event.kind === 'close' && event.connection === facts.events[changed]?.connection),
    'The actual Release 6 connection did not close after versionchange.',
  );
  assert.equal(facts.closedHandleError, 'InvalidStateError');
  assert.equal(facts.draftBefore, staleDraft);
  assert.equal(facts.draftAfter, staleDraft, 'The failed old-tab save must retain the pending text.');
  assert.match(facts.saveError, /The note could not be saved.*retry or copy your text/);
  assert.equal(facts.versionErrorAfterSave, true, 'The later old save must actually attempt and fail a v2 reopen.');
  assert.equal(facts.savedByB.version, 3);
  assert.deepEqual(facts.afterOldSave, facts.savedByB, 'Old-tab saving altered candidate data.');
  const state = facts.savedByB.rows.find(([key]) => key === 'state')?.[1];
  assert.ok(state && typeof state === 'object' && 'ranking' in state && Array.isArray(state.ranking));
  assert.ok(!state.ranking.some((row: { id: string }) => row.id === removed), 'Removed ranking was resurrected.');
  assert.ok(
    state.ranking.some((row: { id: string; note: string }) => row.id === retained && row.note === candidateNote),
    'Candidate note was not durably saved.',
  );
}

export function assertBlockedEvidence(facts: {
  before: DatabaseSnapshot;
  blocked: DatabaseSnapshot;
  afterRetry: DatabaseSnapshot;
  notice: string;
  blockedNoticeCount: number;
  recoveredNoticeCount: number;
  versionchanges: number;
  retry: string;
  retryReloads: number;
  stillBlockedAfterRetry?: DatabaseSnapshot;
  retryFocused?: boolean;
  reblockedNoticeCount?: number;
}) {
  assert.equal(facts.before.version, 2);
  assert.deepEqual(facts.blocked, facts.before, 'Blocked upgrade must not change saved rows.');
  assert.ok(facts.versionchanges > 0, 'The synthetic connection did not block a real upgrade.');
  assert.match(facts.notice, /Close other Play 100 tabs.*retry/);
  assert.match(facts.notice, /saved data has not been (changed|overwritten)/);
  assert.equal(facts.blockedNoticeCount, 1, 'Exactly one blocked notice must explain the whole opening failure.');
  assert.equal(facts.recoveredNoticeCount, 0, 'Recovery must dismiss the blocked opening notice.');
  assert.ok(['explicit-browser-reload', 'blocked-notice-button'].includes(facts.retry));
  assert.equal(facts.retryReloads, facts.retry === 'blocked-notice-button' ? 0 : 1);
  if (facts.retry === 'blocked-notice-button') {
    assert.deepEqual(facts.stillBlockedAfterRetry, facts.before, 'The still-blocked retry changed saved data.');
    assert.equal(facts.retryFocused, true, 'The blocked retry lost its action focus.');
    assert.equal(facts.reblockedNoticeCount, 1, 'A still-blocked retry must not duplicate the notice.');
  }
  assert.equal(facts.afterRetry.version, 3);
  assert.deepEqual(facts.afterRetry.rows, facts.before.rows, 'Retry must recover, not replace the saved library.');
}

export async function runMixedVersionPhases(options: {
  A: SwBuild;
  B: SwBuild;
  port: number;
  evidence: string;
  phases: Record<string, unknown>;
  check: (name: string, passed: boolean) => void;
}) {
  const { A, B, port, evidence, phases, check } = options;
  assert.equal(A.commit, RELEASE6_COMMIT, 'The mixed-version campaign requires the exact Release 6 baseline.');
  const origin = `http://127.0.0.1:${port}`;
  for (const name of ['mixedVersion', 'blockedUpgrade', 'blockedReload']) {
    const blocked = name !== 'mixedVersion';
    const retry = name === 'blockedUpgrade' ? 'blocked-notice-button' : 'explicit-browser-reload';
    const phase: Record<string, unknown> = {
      profile: path.join(evidence, `${name}-profile`),
      retry: blocked ? retry : null,
    };
    phases[name] = phase;
    const context = await launchProfile(path.join(evidence, `${name}-profile`));
    let server: Awaited<ReturnType<typeof startSwServer>> | undefined;
    const servers: Awaited<ReturnType<typeof startSwServer>>[] = [];
    try {
      server = await startSwServer(A, port);
      servers.push(server);
      const old = context.pages()[0] ?? (await context.newPage());
      await seed(old, origin, blocked);
      const before = await snapshotDatabase(old, blocked);
      phase.before = before;
      if (!blocked) {
        await old.addInitScript(observeConnections);
        await old.goto(`${origin}/my-rankings`, { waitUntil: 'load' });
        await expect(old.locator('.ranking-row-content')).toHaveCount(2);
        assert.equal((await documentInfo(old)).entry, A.entry);
        phase.oldDocument = await documentInfo(old);
        assert.equal(
          (await documentInfo(old)).controlled,
          false,
          'The old tab must run the baseline, not a worker response.',
        );
        const note = await noteField(old, 'Mixed removed');
        await note.fill(staleDraft);
        phase.draftBefore = await note.inputValue();
        assert.deepEqual(await snapshotDatabase(old), before, 'The draft was saved before the upgrade.');
      }
      await server.stop();
      server = undefined;
      server = await startSwServer(B, port);
      servers.push(server);
      const candidate = await context.newPage(),
        events = track(candidate);
      phase.candidateEvents = events;
      await candidate.goto(`${origin}/my-rankings`, { waitUntil: 'load' });
      if (blocked) {
        const banner = candidate.locator('.storage-banner[role="alert"]').filter({
          hasText: /Close other Play 100 tabs/,
        });
        await expect(banner).toHaveCount(1, { timeout: 30000 });
        await expect(banner).toBeVisible({ timeout: 30000 });
        const blockedNoticeCount = await banner.count();
        const notice = await banner.innerText(),
          blockedState = await snapshotDatabase(old, true);
        const versionchanges = await old.evaluate(() => window.__mixedBlockedChanges);
        Object.assign(phase, { notice, blocked: blockedState, versionchanges, blockedNoticeCount });
        await candidate.screenshot({ path: path.join(evidence, `${name}.png`) });
        const retryButton = banner.getByRole('button', { name: 'Try again', exact: true });
        let stillBlockedAfterRetry: DatabaseSnapshot | undefined;
        let retryFocused: boolean | undefined;
        let reblockedNoticeCount: number | undefined;
        if (retry === 'blocked-notice-button') {
          await expect(retryButton).toBeEnabled();
          await retryButton.click();
          // The product deliberately waits five seconds before classifying a blocked reopen.
          await expect(retryButton).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15000 });
          await expect(banner).toHaveCount(1);
          await expect(banner).toContainText(/Close other Play 100 tabs/);
          await expect(retryButton).toBeFocused();
          stillBlockedAfterRetry = await snapshotDatabase(old, true);
          retryFocused = await retryButton.evaluate((element) => element === document.activeElement);
          reblockedNoticeCount = await banner.count();
          Object.assign(phase, { stillBlockedAfterRetry, retryFocused, reblockedNoticeCount });
          assert.deepEqual(stillBlockedAfterRetry, before, 'Retry while blocked altered saved data.');
        }
        await old.evaluate(() => window.__mixedBlocker.close());
        const loads = events.loads;
        // No transient-mode edits are made: either retry must read the original saved library.
        if (retry === 'blocked-notice-button') {
          await retryButton.click();
          await expect(candidate.locator('.ranking-row-content')).toHaveCount(2);
          assert.equal(events.loads, loads, 'The in-page storage retry must not reload.');
          phase.retryReloads = events.loads - loads;
        } else await candidate.reload({ waitUntil: 'load' });
        await expect(candidate.locator('.ranking-row-content')).toHaveCount(2);
        await expect(banner).toHaveCount(0);
        const recoveredNoticeCount = await banner.count();
        const afterRetry = await snapshotDatabase(candidate);
        phase.afterRetry = afterRetry;
        phase.retryReloads = events.loads - loads;
        phase.recoveredNoticeCount = recoveredNoticeCount;
        assertBlockedEvidence({
          before,
          blocked: blockedState,
          afterRetry,
          notice,
          blockedNoticeCount,
          recoveredNoticeCount,
          reblockedNoticeCount,
          versionchanges,
          retry,
          retryReloads: events.loads - loads,
          stillBlockedAfterRetry,
          retryFocused,
        });
      } else {
        await expect(candidate.locator('.ranking-row-content')).toHaveCount(2);
        const upgraded = await snapshotDatabase(candidate);
        phase.upgraded = upgraded;
        const closedHandleError = await old.evaluate(() => {
          const changed = window.__mixedEvents.find(
            (event) => event.kind === 'versionchange' && event.nextVersion === 3,
          );
          if (!changed) return 'NoVersionChange';
          try {
            const connection = window.__mixedConnections[changed.connection];
            if (!connection) return 'NoConnection';
            connection.db.transaction('library', 'readonly');
            return 'StillOpen';
          } catch (error) {
            return error instanceof DOMException ? error.name : String(error);
          }
        });
        phase.closedHandleError = closedHandleError;
        phase.connectionEventsAfterUpgrade = await old.evaluate(() => window.__mixedEvents);
        phase.draftAfterUpgrade = await old.getByLabel('Your note for Mixed removed', { exact: true }).inputValue();
        await candidate.getByRole('button', { name: 'Remove Mixed removed from my ranking', exact: true }).click();
        await candidate
          .getByRole('dialog', { name: 'Remove Mixed removed from ranking?', exact: true })
          .getByRole('button', { name: 'Remove from ranking', exact: true })
          .click();
        await expect(candidate.locator('.ranking-row-content')).toHaveCount(1);
        const field = await noteField(candidate, 'Mixed retained');
        await field.fill(candidateNote);
        await field.press('Tab');
        await expect.poll(async () => JSON.stringify(await snapshotDatabase(candidate))).toContain(candidateNote);
        const savedByB = await snapshotDatabase(candidate);
        phase.savedByB = savedByB;
        const note = await noteField(old, 'Mixed removed');
        await expect(note).toHaveValue(staleDraft);
        const beforeSave = await old.evaluate(() => window.__mixedEvents.length);
        await note.focus();
        await note.press('Tab');
        const error = old.getByRole('alert').filter({ hasText: 'The note could not be saved.' });
        await expect(error).toBeVisible();
        const facts = {
          before,
          upgraded,
          savedByB,
          afterOldSave: await snapshotDatabase(candidate),
          events: await old.evaluate(() => window.__mixedEvents),
          closedHandleError,
          draftBefore: String(phase.draftBefore),
          draftAfter: await note.inputValue(),
          saveError: await error.innerText(),
          versionErrorAfterSave: await old.evaluate(
            (start) =>
              window.__mixedEvents
                .slice(start)
                .some((event) => event.kind === 'error' && event.version === 2 && event.error === 'VersionError'),
            beforeSave,
          ),
        };
        Object.assign(phase, facts);
        await old.screenshot({ path: path.join(evidence, 'old-tab-save-refused.png') });
        assertMixedEvidence(facts);
      }
      phase.candidateDocument = await documentInfo(candidate);
      assert.equal((await documentInfo(candidate)).entry, B.entry);
      assert.equal((await documentInfo(candidate)).controlled, false);
      assert.equal((await documentInfo(candidate)).violations, 0);
      assert.equal(events.cspConsole.length, 0);
      assert.equal(events.pageErrors.length, 0);
      check(name, true);
    } catch (error) {
      phase.error = String(error);
      throw error;
    } finally {
      try {
        await context.close();
      } finally {
        await server?.stop();
        phase.servers = servers.map(({ requests, errors }) => ({ requests, errors }));
        assert.ok(
          servers.every((item) => !item.errors.length),
          'Mixed-version server failed.',
        );
      }
    }
  }
}
