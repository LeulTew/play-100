import { nvdaTest as test } from '@guidepup/playwright';
import type { NVDAPlaywright } from '@guidepup/playwright';
import type { Page } from '@playwright/test';
import { SpeechJournal } from '../src/speech.ts';
import { journeyBrowseMode, journeyCompare, journeyDialog, journeyDiscover, journeySettings } from './journeys.ts';
import type { JourneyContext, NvdaCommand } from './journeys.ts';
import { FULL, delay, runJourney, writeVersions } from './support.ts';

const READER = 'nvda';

// The same cleaning Guidepup applies to window titles before comparing them.
const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/[|¦:;'"`\-‐–—·_()[\]{}\\^~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Moves NVDA into Chrome's web content by keyboard: Alt+Escape until NVDA reports Chrome's title, F6 until the page
 * has focus, then Escape to leave focus mode and Control+Home to start browse mode at the top.
 */
async function focusChrome(nvda: NVDAPlaywright, page: Page): Promise<void> {
  await page.bringToFront();
  const title = clean(await page.title());
  for (let attempt = 0; attempt < 10; attempt++) {
    await nvda.perform(nvda.keyboardCommands.reportTitle, FULL);
    const spoken = clean(await nvda.lastSpokenPhrase());
    if ((title && spoken.startsWith(title)) || spoken.includes('google chrome')) break;
    await nvda.press('Alt+Escape', { capture: false });
    await delay(500);
  }
  for (let attempt = 0; attempt < 4 && !(await page.evaluate(() => document.hasFocus())); attempt++) {
    await nvda.press('F6', FULL);
    await delay(300);
  }
  await nvda.press('Escape', FULL);
  await nvda.press('Control+Home', FULL);
}

function context(nvda: NVDAPlaywright, page: Page, journal: SpeechJournal): JourneyContext {
  return {
    kind: 'nvda',
    reader: nvda,
    page,
    journal,
    focusBrowser: async (label) => {
      await focusChrome(nvda, page);
      journal.step(
        `${label}: focus Chrome`,
        ['Alt+Escape', 'F6', 'Escape', 'Control+Home'],
        await nvda.spokenPhraseLog(),
      );
    },
    reportFocus: async () => {
      await nvda.perform(nvda.keyboardCommands.reportCurrentFocus, FULL);
      return { keys: ['NVDA+Tab'], label: 'report focus (NVDA+Tab)' };
    },
    command: async (name: NvdaCommand, options = FULL) => {
      await nvda.perform(nvda.keyboardCommands[name], options);
    },
  };
}

test.use({ nvdaStartOptions: { capture: true } });

test.beforeEach(() => {
  test.setTimeout(10 * 60_000);
});

test('versions', async ({ page }) => {
  await writeVersions(READER, {
    browser: { name: 'Google Chrome', version: page.context().browser()?.version() },
    userAgent: await page.evaluate(() => navigator.userAgent),
  });
});

const journeys = {
  'a-dialog': journeyDialog,
  'b-browse-mode': journeyBrowseMode,
  'c-settings': journeySettings,
  'd-discover': journeyDiscover,
  'e-compare': journeyCompare,
} as const;

for (const [name, journey] of Object.entries(journeys)) {
  test(`${name}`, async ({ nvda, page }) => {
    const journal = new SpeechJournal(name);
    await runJourney(READER, journal, page, () => journey(context(nvda, page, journal)));
  });
}
