import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  RESULT_COUNT,
  TRAY_STATE,
  countSpoken,
  descriptionFragment,
  expectSpoken,
  expectSpokenTimes,
  expectTrue,
  pinConfirmation,
  spoke,
} from '../src/speech.ts';
import type { SpeechJournal } from '../src/speech.ts';
import { FULL, describeFocus, escapeUntilClosed, focusIsOn, key, origin, tabTo } from './support.ts';
import type { Reader } from './support.ts';

export type ReaderKind = 'nvda' | 'voiceover';

export interface JourneyContext {
  kind: ReaderKind;
  reader: Reader;
  page: Page;
  journal: SpeechJournal;
  /** Brings the browser to the reader's attention by keyboard and leaves the reader at the top of the page. */
  focusBrowser: (label: string) => Promise<void>;
  /** Asks the reader to speak the item with keyboard focus, as a user would when a change went unannounced. */
  reportFocus: () => Promise<{ keys: string[]; label: string }>;
  /** NVDA only: run a named NVDA command (for example the browse-mode heading key). */
  command?: (name: NvdaCommand, options?: { capture?: true | false | 'initial' }) => Promise<void>;
}

export type NvdaCommand = 'moveToNextHeadingLevel3' | 'reportCurrentFocus' | 'toggleBetweenBrowseAndFocusMode';

const COLLECTION = '/?catalogs=off';

async function open(context: JourneyContext, path: string, ready: Locator): Promise<void> {
  await context.page.goto(new URL(path, origin).href, { waitUntil: 'domcontentloaded' });
  await ready.first().waitFor({ state: 'visible', timeout: 60_000 });
  await context.focusBrowser(`open ${path}`);
}

const firstCard = (page: Page) => page.locator('li.game-card[data-game]').first();

async function cardFacts(card: Locator) {
  return card.evaluate((element) => ({
    slug: element.getAttribute('data-game') ?? '',
    title: element.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  }));
}

function detailDialog(page: Page, title: string): Locator {
  return page.getByRole('dialog', { name: title });
}

async function waitForDialog(dialog: Locator, label: string): Promise<void> {
  try {
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    throw new Error(`${label}: the dialog did not open`);
  }
}

/** Checks the dialog's speech, closes it with Escape, and checks where focus returned. Shared by journeys a and b. */
async function closeDetailAndCheckReturn(context: JourneyContext, slug: string, title: string, dialog: Locator) {
  const { page, reader, journal } = context;
  const closing = await escapeUntilClosed(reader, journal, page, 'close the dialog', dialog);
  const focus = await describeFocus(page);
  journal.check(
    expectTrue(
      'focus returns to the card',
      focus.game === slug && focus.tag !== 'BODY',
      `focus is on ${focus.tag}${focus.game ? ` in card ${focus.game}` : ''}; expected card ${slug}`,
    ),
  );
  let returned = closing;
  if (!spoke(returned, title)) {
    // A reader can stay silent on a focus return that changes nothing it tracks. Ask it where focus is, as a user would.
    const { keys, label } = await context.reportFocus();
    returned = [...returned, ...journal.step(label, keys, await reader.spokenPhraseLog(), focus)];
  }
  journal.check(expectSpoken('the returned card name is spoken', returned, title));
}

/** (a) Tab to a card in The 100, open it with Enter, hear it once, and return to it with Escape. */
export async function journeyDialog(context: JourneyContext): Promise<void> {
  const { page, reader, journal, kind } = context;
  await open(context, COLLECTION, page.locator('li.game-card'));
  const card = firstCard(page);
  const { slug, title } = await cardFacts(card);
  await tabTo(reader, journal, page, `Tab to the ${title} card`, card.locator('a.game-link'), { max: 120 });
  const opened = await key(reader, journal, page, 'open with Enter', 'Enter');
  const dialog = detailDialog(page, title);
  await waitForDialog(dialog, 'open with Enter');
  const description = (await dialog.locator('.rationale').first().textContent()) ?? '';
  const fragment = descriptionFragment(description);
  journal.check(expectSpoken('the dialog name is spoken', opened, title));
  journal.check(expectSpoken('the dialog role is spoken', opened, 'dialog'));
  if (kind === 'nvda') {
    journal.check(expectSpoken('the heading is spoken', opened, /heading/));
    journal.check(expectSpokenTimes('the description is spoken once', opened, fragment, 1));
  } else {
    const count = countSpoken(opened, fragment);
    journal.check(
      expectTrue('the description is not spoken twice', count <= 1, `heard "${fragment}" ${count} time(s), at most 1`),
    );
  }
  await closeDetailAndCheckReturn(context, slug, title, dialog);
}

/** (b) NVDA browse mode: reach a card heading with the virtual cursor, activate it, close with Escape. */
export async function journeyBrowseMode(context: JourneyContext): Promise<void> {
  const { page, reader, journal, command } = context;
  if (!command) throw new Error('browse-mode journey needs NVDA');
  await open(context, COLLECTION, page.locator('li.game-card'));
  const cards = await page.locator('li.game-card[data-game]').evaluateAll((elements) =>
    elements.map((element) => ({
      slug: element.getAttribute('data-game') ?? '',
      title: element.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    })),
  );
  let target: { slug: string; title: string } | undefined;
  for (let press = 1; press <= 30 && !target; press++) {
    await command('moveToNextHeadingLevel3', FULL);
    const spoken = journal.step(`next heading level 3 (${press})`, ['3'], await reader.spokenPhraseLog());
    target = cards.find((card) => card.title && spoke(spoken, card.title));
  }
  if (!target) throw new Error('the heading key did not reach a card heading in The 100');
  const before = await describeFocus(page);
  journal.step('DOM focus before activation', [], [], before);
  journal.check(
    expectTrue(
      'the virtual cursor, not DOM focus, is on the card',
      before.game !== target.slug,
      `DOM focus is on ${before.tag}${before.game ? ` in card ${before.game}` : ''}`,
    ),
  );
  const opened = await key(reader, journal, page, `activate the ${target.title} heading with Enter`, 'Enter');
  const dialog = detailDialog(page, target.title);
  await waitForDialog(dialog, 'activate the heading');
  journal.check(expectSpoken('the dialog name is spoken', opened, target.title));
  // The local Release 7 finding lost focus to BODY after ranking the game inside the dialog, which re-renders its card.
  const rank = dialog.getByRole('button', { name: /Add to my ranking/i });
  await tabTo(reader, journal, page, 'Tab to Add to my ranking', rank, { max: 30 });
  await key(reader, journal, page, 'add the game to my ranking with Enter', 'Enter');
  await expect(dialog.getByText(/Your rank/i).first()).toBeVisible({ timeout: 10_000 });
  await checkSpokenOrReport(context, 'the ranking change is spoken', 'add the game to my ranking with Enter', /rank/i);
  await closeDetailAndCheckReturn(context, target.slug, target.title, dialog);
}

/** (c) Menu, then Settings & backups: choose Lite, hear it saved, close, and return to Menu. */
export async function journeySettings(context: JourneyContext): Promise<void> {
  const { page, reader, journal, command } = context;
  await open(context, COLLECTION, page.locator('li.game-card'));
  const menu = page.getByRole('button', { name: 'Menu', exact: true }).filter({ visible: true }).first();
  await tabTo(reader, journal, page, 'Tab to Menu', menu, { max: 60 });
  await key(reader, journal, page, 'open Menu with Enter', 'Enter');
  const menuHeading = page.locator('#menu-title');
  await menuHeading.waitFor({ state: 'visible', timeout: 10_000 });
  const settingsButton = page.getByRole('button', { name: 'Settings & backups' }).filter({ visible: true }).first();
  await tabTo(reader, journal, page, 'Tab to Settings & backups', settingsButton, { max: 40 });
  await key(reader, journal, page, 'open Settings & backups with Enter', 'Enter');
  const settings = page.locator('dialog:has(#settings-title), [role="dialog"]:has(#settings-title)').first();
  await waitForDialog(settings, 'open Settings & backups');
  const lite = settings.getByRole('radio', { name: 'Lite', exact: true });
  const radios = settings.getByRole('radio');
  await tabTo(reader, journal, page, 'Tab to the visual experience radios', radios, { max: 40 });
  await key(reader, journal, page, 'ArrowUp to Lite', 'ArrowUp');
  if (!(await lite.isChecked()) && command) {
    // NVDA stayed in browse mode, so the arrow moved its cursor. Move back and switch to focus mode, as a user would.
    await key(reader, journal, page, 'ArrowDown back to the radio', 'ArrowDown');
    await command('toggleBetweenBrowseAndFocusMode', FULL);
    journal.step('focus mode (NVDA+Space)', ['NVDA+Space'], await reader.spokenPhraseLog(), await describeFocus(page));
  }
  for (let press = 1; press <= 3 && !(await lite.isChecked()); press++)
    await key(reader, journal, page, `ArrowUp toward Lite (${press})`, 'ArrowUp');
  journal.check(expectTrue('Lite is selected by keyboard', await lite.isChecked(), 'the Lite radio is checked'));
  journal.check(expectSpoken('the save is announced', journal.since('ArrowUp to Lite'), 'Visual preference saved.'));
  await checkSpokenOrReport(context, 'Lite is spoken', 'ArrowUp to Lite', 'Lite');
  const closing = await escapeUntilClosed(reader, journal, page, 'close Settings & backups', settings);
  const returnedToMenu = await focusIsOn(menu);
  const focus = await describeFocus(page);
  journal.check(
    expectTrue(
      'focus returns to Menu',
      returnedToMenu,
      `focus is on ${focus.tag} "${focus.label ?? focus.text ?? ''}"`,
    ),
  );
  let heard = closing;
  if (!spoke(heard, 'menu') && command) {
    await command('reportCurrentFocus', FULL);
    heard = [...heard, ...journal.step('report focus (NVDA+Tab)', ['NVDA+Tab'], await reader.spokenPhraseLog(), focus)];
  }
  journal.check(expectSpoken('Menu is spoken on return', heard, 'menu'));
}

/**
 * Checks that a phrase was spoken since a step. If the reader stayed silent on the change, it asks the reader once
 * for the focused item, as a user would, and checks again. The extra step stays in the log, so the receipt shows it.
 */
async function checkSpokenOrReport(
  context: JourneyContext,
  name: string,
  sinceLabel: string,
  needle: string | RegExp,
): Promise<void> {
  const { page, reader, journal } = context;
  if (!spoke(journal.since(sinceLabel), needle)) {
    const { keys, label } = await context.reportFocus();
    journal.step(label, keys, await reader.spokenPhraseLog(), await describeFocus(page));
  }
  journal.check(expectSpoken(name, journal.since(sinceLabel), needle));
}

/** (d) Discover: type Portal into the search and hear the result count. */
export async function journeyDiscover(context: JourneyContext): Promise<void> {
  const { page, reader, journal } = context;
  await open(context, '/discover', page.locator('#catalog-search'));
  const status = page.locator('.discovery-page p[role="status"]').first();
  await expect(status).not.toHaveText(/Loading/, { timeout: 60_000 });
  const search = page.locator('#catalog-search');
  await tabTo(reader, journal, page, 'Tab to Find a game', search, { max: 60 });
  await checkSpokenOrReport(context, 'the search field is named', 'Tab to Find a game', 'find a game');
  await reader.type('Portal', FULL);
  const typed = journal.step('type Portal', ['P', 'o', 'r', 't', 'a', 'l'], await reader.spokenPhraseLog(), {
    ...(await describeFocus(page)),
    value: await search.inputValue(),
    status: await status.textContent(),
  });
  journal.check(
    expectTrue('Portal was typed into the search', (await search.inputValue()) === 'Portal', 'input value'),
  );
  journal.check(expectSpoken('the result count is announced', typed, RESULT_COUNT));
}

/** (e) Pin a game from the collection, hear the confirmation, then hear the compare tray's state. */
export async function journeyCompare(context: JourneyContext): Promise<void> {
  const { page, reader, journal } = context;
  await open(context, COLLECTION, page.locator('li.game-card'));
  const card = firstCard(page);
  const { title } = await cardFacts(card);
  const pin = card.getByRole('button', { name: `Pin for comparison: ${title}`, exact: true });
  await tabTo(reader, journal, page, `Tab to Pin for comparison: ${title}`, pin, { max: 140 });
  const pinned = await key(reader, journal, page, 'pin with Enter', 'Enter');
  await expect(card.getByRole('button', { name: `Pinned for comparison: ${title}`, exact: true })).toBeVisible();
  journal.check(expectSpoken('the pin is confirmed', pinned, pinConfirmation(title)));
  const tray = page.getByRole('button', { name: TRAY_STATE_LABEL }).filter({ visible: true }).first();
  const reached = await tabTo(reader, journal, page, 'Shift+Tab to the compare tray', tray, {
    reverse: true,
    max: 140,
  });
  journal.check(expectSpoken("the tray's state is spoken", reached, TRAY_STATE));
}

const TRAY_STATE_LABEL = /^\d+ games? in (?:Compare|Temporary) tray$/;
