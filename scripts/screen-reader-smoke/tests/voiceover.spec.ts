import { voiceOverTest as test } from '@guidepup/playwright';
import type { VoiceOverPlaywright } from '@guidepup/playwright';
import { macOSActivate } from '@guidepup/guidepup';
import type { Page } from '@playwright/test';
import { SpeechJournal } from '../src/speech.ts';
import { journeyCompare, journeyDialog, journeyDiscover, journeySettings } from './journeys.ts';
import type { JourneyContext } from './journeys.ts';
import { FULL, delay, runJourney, writeVersions } from './support.ts';

const READER = 'voiceover';

/** Brings Chrome forward so VoiceOver follows the page's keyboard focus. Nothing on the page is clicked or focused. */
async function focusChrome(page: Page): Promise<void> {
  await page.bringToFront();
  await macOSActivate('Google Chrome');
  await delay(1_000);
}

function context(voiceOver: VoiceOverPlaywright, page: Page, journal: SpeechJournal): JourneyContext {
  return {
    kind: 'voiceover',
    reader: voiceOver,
    page,
    journal,
    focusBrowser: async (label) => {
      await focusChrome(page);
      journal.step(`${label}: activate Chrome`, [], await voiceOver.spokenPhraseLog());
    },
    reportFocus: async () => {
      await voiceOver.perform(voiceOver.keyboardCommands.describeItemWithKeyboardFocus, FULL);
      return { keys: ['VO+F4'], label: 'describe the focused item (VO+F4)' };
    },
  };
}

test.use({ voiceOverStartOptions: { capture: true } });

test.beforeEach(() => {
  test.setTimeout(10 * 60_000);
});

test('versions', async ({ page }) => {
  await writeVersions(READER, {
    browser: { name: 'Google Chrome', version: page.context().browser()?.version() },
    userAgent: await page.evaluate(() => navigator.userAgent),
  });
});

// Journey b is NVDA's browse mode, which VoiceOver has no direct equivalent of.
const journeys = {
  'a-dialog': journeyDialog,
  'c-settings': journeySettings,
  'd-discover': journeyDiscover,
  'e-compare': journeyCompare,
} as const;

for (const [name, journey] of Object.entries(journeys)) {
  test(`${name}`, async ({ voiceOver, page }) => {
    const journal = new SpeechJournal(name);
    await runJourney(READER, journal, page, () => journey(context(voiceOver, page, journal)));
  });
}
