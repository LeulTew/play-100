import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { googleOutboundEvidence, redactOAuthUrls } from './google.ts';

export interface WebElement {
  'element-6066-11e4-a52e-4f735466cecf': string;
}

export interface SmokeContext {
  site: string;
  step(name: string, action: () => Promise<unknown>): Promise<void>;
  wd<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
  execute<T = unknown>(script: string, ...args: unknown[]): Promise<T>;
  waitFor<T = unknown>(script: string, message: string, timeout?: number): Promise<NonNullable<T>>;
  click(selector: string, outbound?: boolean): Promise<WebElement>;
  navigation(label: string): Promise<void>;
  drag(from: WebElement, to: WebElement): Promise<unknown>;
  nativeAction<T>(action: () => Promise<T>): Promise<T>;
  nativeTouch(element: WebElement): Promise<void>;
  collectErrors(): Promise<void>;
  installCollector(previousTimeOrigin?: number): Promise<unknown>;
  assertLoaded(): Promise<void>;
  capture(name: string): Promise<void>;
  artifact(name: string, text: string): Promise<void>;
}

interface QueueRecord {
  id: string;
  title: string;
}

const rows = 'ol.personal-records[aria-label="Your Play later games"] .personal-row';
const queueSnapshot = `
  return [...document.querySelectorAll(${JSON.stringify(rows)})].map(row => ({
    id: row.dataset.recordId, title: row.querySelector('.record-title').textContent.trim()
  }));
`;
const sheetPredicate =
  'visible == true AND (name == "ActivityListView" OR (type == "XCUIElementTypeButton" AND label == "Copy"))';

async function go(context: SmokeContext, path: string) {
  const before = await context.execute<number>('return performance.timeOrigin;');
  await context.collectErrors();
  await context.wd('POST', '/url', { url: `${context.site}${path}` });
  await context.installCollector(before);
  await context.assertLoaded();
}

async function nativeElements(context: SmokeContext, value: string) {
  return context.wd<WebElement[]>('POST', '/elements', { using: '-ios predicate string', value });
}

async function queueReorder(context: SmokeContext) {
  await context.navigation('The 100');
  const games = await context.waitFor<{ slug: string; title: string }[]>(
    `const cards = [...document.querySelectorAll('.game-card')].slice(0, 3);
    return cards.length === 3 ? cards.map(card => ({
      slug: card.dataset.game, title: card.querySelector('.game-link h3').textContent.trim()
    })) : null;`,
    'three collection games',
  );
  for (const game of games) {
    const selector = `.game-card[data-game=${JSON.stringify(game.slug)}] .save-game`;
    await context.execute('document.querySelector(arguments[0]).scrollIntoView({ block: "center" });', selector);
    assert.equal(
      await context.execute('return document.querySelector(arguments[0]).getAttribute("aria-pressed");', selector),
      'false',
      'The fresh simulator must not have saved this game already.',
    );
    await context.click(selector);
    await context.waitFor(
      `return document.querySelector(${JSON.stringify(selector)})?.getAttribute("aria-pressed") === "true";`,
      `${game.title} saved to Play later`,
    );
  }
  await go(context, '/my-games?tab=queue');
  await context.waitFor(`return document.querySelectorAll(${JSON.stringify(rows)}).length === 3;`, 'three queue rows');
  const before = await context.execute<QueueRecord[]>(queueSnapshot);
  assert.equal(new Set(before.map((record) => record.id)).size, 3, 'Queue record IDs must be unique.');
  assert.deepEqual(
    before.map((record) => record.title).sort(),
    games.map((game) => game.title).sort(),
  );
  const expected = [before[1], before[0], before[2]];
  assert.ok(expected.every(Boolean));
  await context.execute(
    `document.querySelector(${JSON.stringify(rows)}).scrollIntoView({ block: "center" });`,
  );
  const handles = await context.execute<WebElement[]>(
    `return [...document.querySelectorAll(${JSON.stringify(rows)})].slice(0, 2).map(row => row.querySelector('.drag-handle'));`,
  );
  const [from, to] = handles;
  assert.ok(from && to, 'Both visible drag handles are required.');
  await context.capture('09-queue-before-drag');
  const gesture = await context.drag(from, to);
  await context.waitFor(
    `const records = (${JSON.stringify(expected)});
    const ids = [...document.querySelectorAll(${JSON.stringify(rows)})].map(row => row.dataset.recordId);
    return JSON.stringify(ids) === JSON.stringify(records.map(record => record.id));`,
    'touch drag swapped the first two queue rows',
  );
  const after = await context.execute<QueueRecord[]>(queueSnapshot);
  assert.deepEqual(after, expected);
  await context.capture('09-queue-after-drag');
  const documentBeforeReload = await context.execute<number>('return performance.timeOrigin;');
  await context.collectErrors();
  await context.wd('POST', '/refresh', {});
  await context.installCollector(documentBeforeReload);
  await context.assertLoaded();
  await context.waitFor(`return document.querySelectorAll(${JSON.stringify(rows)}).length === 3;`, 'queue after reload');
  const persisted = await context.execute<QueueRecord[]>(queueSnapshot);
  assert.deepEqual(persisted, expected, 'The physical drag order must persist after a real reload.');
  return { games, before, after, persisted, gesture };
}

async function nativeShare(context: SmokeContext) {
  await go(context, '/');
  const card = await context.waitFor<WebElement>('return document.querySelector(".game-card");', 'collection card');
  await context.execute('arguments[0].scrollIntoView({ block: "center" });', card);
  await context.click('.game-card .game-link');
  const title = await context.waitFor<string>(
    'return document.querySelector(".game-dialog[open] #game-title")?.textContent.trim();',
    'share game detail',
  );
  assert.equal(await context.execute('return typeof navigator.share;'), 'function', 'Native sharing must be available.');
  await context.execute(`
    const state = window.__iosShareEvidence = { messages: [] };
    const inspect = () => {
      for (const element of document.querySelectorAll('.toast.toast-visible,.detail-share-notice,.share-dialog[open]')) {
        if (element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden') {
          const text = element.textContent.trim();
          if (!state.messages.includes(text)) state.messages.push(text);
        }
      }
    };
    state.observer = new MutationObserver(inspect);
    state.observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    inspect();
  `);
  let sheetOpened = false;
  try {
    await context.click('.game-dialog[open] .share-detail');
    await context.nativeAction(async () => {
      const deadline = Date.now() + 15_000;
      let sheet: WebElement[] = [];
      while (!sheet.length && Date.now() < deadline) {
        sheet = await nativeElements(context, sheetPredicate);
        if (!sheet.length) await delay(200);
      }
      assert.ok(sheet.length, 'The native iOS ActivityListView or Copy option must appear.');
      sheetOpened = true;
      await context.artifact('10-native-share-sheet.xml', await context.wd<string>('GET', '/source'));
      await context.capture('10-native-share-sheet');
    });
  } finally {
    if (sheetOpened) {
      await context.nativeAction(async () => {
        const close = await nativeElements(
          context,
          'type == "XCUIElementTypeButton" AND visible == true AND (label == "Close" OR label == "Cancel")',
        );
        assert.equal(close.length, 1, 'The native share sheet must expose one dismissal button.');
        assert.ok(close[0]);
        await context.nativeTouch(close[0]);
        const deadline = Date.now() + 10_000;
        let remaining = await nativeElements(context, sheetPredicate);
        while (remaining.length && Date.now() < deadline) {
          await delay(200);
          remaining = await nativeElements(context, sheetPredicate);
        }
        assert.equal(remaining.length, 0, 'The native share sheet must disappear after dismissal.');
      });
    }
  }
  await delay(1000);
  const fallbackMessages = await context.execute<string[]>(
    'window.__iosShareEvidence.observer.disconnect(); return window.__iosShareEvidence.messages;',
  );
  assert.deepEqual(fallbackMessages, [], 'Native sharing and cancellation must not show fallback feedback.');
  return { title, nativeSheetObserved: true, dismissed: true, fallbackMessages };
}

async function googleOutbound(context: SmokeContext) {
  await go(context, '/account');
  await context.waitFor(
    'const button = document.querySelector(".google-signin"); return button && !button.disabled;',
    'Continue with Google ready on Account',
  );
  await context.execute(
    'window.__iosSmoke.outbound = true; sessionStorage.removeItem("ios-smoke-google-trusted");',
  );
  await context.collectErrors();
  let evidence: ReturnType<typeof googleOutboundEvidence> | undefined;
  try {
    await context.click('.google-signin', true);
    const deadline = Date.now() + 45_000;
    let url = await context.wd<string>('GET', '/url');
    while (new URL(url).origin !== 'https://accounts.google.com' && Date.now() < deadline) {
      await delay(300);
      url = await context.wd<string>('GET', '/url');
    }
    await context.artifact('11-google-outbound-url.txt', redactOAuthUrls(url));
    assert.equal(new URL(url).origin, 'https://accounts.google.com', 'Continue with Google must leave for Google.');
    await context.capture('11-google-provider');
    evidence = googleOutboundEvidence(url);
    await context.artifact('11-google-outbound.json', JSON.stringify(evidence, null, 2));
    await context.waitFor(
      'return /\\bplay[\\s:._-]*100\\b/i.test(document.body.innerText);',
      'Google identifies the client as Play 100',
    );
    await context.artifact('11-google-outbound.json', JSON.stringify({ ...evidence, clientBrand: 'Play 100' }, null, 2));
    assert.equal(evidence.redirectUri, `${context.site}/__/auth/handler`, 'The OAuth callback must target this app.');
  } finally {
    const current = new URL(await context.wd<string>('GET', '/url'));
    if (current.origin !== context.site) {
      await context.wd('POST', '/back', {});
      const deadline = Date.now() + 60_000;
      while (new URL(await context.wd<string>('GET', '/url')).origin !== context.site && Date.now() < deadline) {
        await delay(300);
      }
      assert.equal(
        new URL(await context.wd<string>('GET', '/url')).origin,
        context.site,
        'One browser Back must return to the candidate app.',
      );
      await context.installCollector();
      await context.assertLoaded();
    }
  }
  assert.equal(
    await context.execute(
      'const trusted = sessionStorage.getItem("ios-smoke-google-trusted"); sessionStorage.removeItem("ios-smoke-google-trusted"); window.__iosSmoke.outbound = false; return trusted;',
    ),
    'true',
    'Google sign-in must originate from a trusted native touch.',
  );
  await context.waitFor(
    `const button = document.querySelector('.google-signin');
    return button && !button.disabled && !document.querySelector('.google-continuation') &&
      !/Signing in[.\\u2026]/i.test(document.body.innerText);`,
    'Back restored an interactive Account without a stuck sign-in state',
  );
  await context.navigation('My games');
  await context.waitFor(
    'return document.querySelector("#my-games-title")?.textContent.trim() === "My games";',
    'app navigation remains usable after Google Back',
  );
  return { ...evidence, clientBrand: 'Play 100', trustedTouch: true, backReturned: true, appUsable: true };
}

export async function runTouchUx(context: SmokeContext) {
  const failures: unknown[] = [];
  for (const [name, action] of [
    ['09-queue-touch-reorder', queueReorder],
    ['10-native-share', nativeShare],
    ['11-google-outbound-back', googleOutbound],
  ] as const) {
    try {
      await context.step(name, () => action(context));
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Touch UX smoke failed; see individual step evidence.');
}
