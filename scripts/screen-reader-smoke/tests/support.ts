import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { release } from 'node:os';
import { join, resolve } from 'node:path';
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { SpeechJournal, summaryLines, validateOrigin } from '../src/speech.ts';

export interface CaptureOptions {
  capture?: true | false | 'initial';
}

/** The parts of the NVDA and VoiceOver drivers these journeys use. Every key goes through the screen reader. */
export interface Reader {
  press(key: string, options?: CaptureOptions): Promise<unknown>;
  type(text: string, options?: CaptureOptions): Promise<unknown>;
  spokenPhraseLog(): Promise<string[]>;
  lastSpokenPhrase(): Promise<string>;
}

export const FULL: CaptureOptions = { capture: true };
export const origin = validateOrigin(process.env.TARGET_ORIGIN);

export function artifactDirectory(readerName: string): string {
  return resolve('artifacts', readerName);
}

export const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** Read-only: is the browser's focused element one of these? */
export async function focusIsOn(target: Locator): Promise<boolean> {
  return target.evaluateAll((elements) => elements.some((element) => element === document.activeElement));
}

/**
 * Passively records DOM focus events (focusin/focusout, with the element and timestamp) from page load, so the journal
 * can tell DOM focus moves apart from the reader's own virtual focus. It only listens; it never moves focus.
 */
export async function installFocusTrace(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const trace: {
      type: string;
      tag: string;
      id: string | null;
      role: string | null;
      name: string | null;
      t: number;
    }[] = [];
    (window as unknown as { __srFocusTrace: typeof trace }).__srFocusTrace = trace;
    const record = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      trace.push({
        type: event.type,
        tag: target?.tagName ?? (event.target === window ? 'WINDOW' : 'UNKNOWN'),
        id: target?.id || null,
        role: target?.getAttribute('role') ?? null,
        name:
          target?.getAttribute('aria-label') ?? target?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? null,
        t: Math.round(performance.now()),
      });
    };
    document.addEventListener('focusin', record, true);
    document.addEventListener('focusout', record, true);
  });
}

/** Read-only description of the focused element for the journal, with the DOM focus events since the last step. */
export async function describeFocus(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const trace = (window as unknown as { __srFocusTrace?: unknown[] }).__srFocusTrace;
    return {
      tag: active?.tagName ?? null,
      id: active?.id || null,
      label: active?.getAttribute('aria-label') ?? null,
      text: active?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? null,
      game: active?.closest('[data-game]')?.getAttribute('data-game') ?? null,
      inDialog: Boolean(active?.closest('dialog[open], [role="dialog"]')),
      documentHasFocus: document.hasFocus(),
      url: location.href,
      focusEvents: trace ? trace.splice(0) : null,
    };
  });
}

/** Records one key press through the reader as a journal step, with the phrases it produced. */
export async function key(
  reader: Reader,
  journal: SpeechJournal,
  page: Page,
  label: string,
  keys: string,
  options: CaptureOptions = FULL,
): Promise<string[]> {
  await reader.press(keys, options);
  return journal.step(label, [keys], await reader.spokenPhraseLog(), await describeFocus(page));
}

/**
 * Presses Tab (or Shift+Tab) through the reader until the browser's focus lands on the target. The focus check is
 * read-only; the keyboard alone moves focus. Returns the phrases spoken on the final press.
 */
export async function tabTo(
  reader: Reader,
  journal: SpeechJournal,
  page: Page,
  label: string,
  target: Locator,
  { reverse = false, max = 80 }: { reverse?: boolean; max?: number } = {},
): Promise<string[]> {
  await target.first().waitFor({ state: 'attached', timeout: 30_000 });
  const keys: string[] = [];
  const keyName = reverse ? 'Shift+Tab' : 'Tab';
  for (let count = 0; count <= max; count++) {
    if (await focusIsOn(target)) {
      return journal.step(label, keys, await reader.spokenPhraseLog(), await describeFocus(page));
    }
    if (count === max) break;
    await reader.press(keyName, FULL);
    keys.push(keyName);
  }
  journal.step(label, keys, await reader.spokenPhraseLog(), await describeFocus(page));
  throw new Error(`${label}: ${max} presses of ${keyName} did not reach the target`);
}

/** Presses Escape until the dialog closes. NVDA's first Escape may only leave focus mode, as it does for users. */
export async function escapeUntilClosed(
  reader: Reader,
  journal: SpeechJournal,
  page: Page,
  label: string,
  dialog: Locator,
): Promise<string[]> {
  const start = journal.steps.length;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await key(reader, journal, page, `${label} (Escape ${attempt})`, 'Escape');
    try {
      await expect(dialog).toBeHidden({ timeout: 3_000 });
      return journal.steps.slice(start).flatMap((step) => step.spoken);
    } catch {
      // Still open: NVDA used the key to leave focus mode. Press again, as a user would.
    }
  }
  throw new Error(`${label}: Escape did not close the dialog`);
}

/** The installed Guidepup screen-reader asset versions, from the pinned package manifest. */
export function guidepupAssets(): Record<string, string> {
  const require = createRequire(import.meta.url);
  const manifestPath = join(require.resolve('@guidepup/guidepup/package.json'), '..', 'manifest.json');
  if (!existsSync(manifestPath)) return {};
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    screenReaders: { id: string; assets: { version: string }[] }[];
  };
  return Object.fromEntries(manifest.screenReaders.map((reader) => [reader.id, reader.assets.at(-1)?.version ?? '']));
}

export async function writeVersions(readerName: string, details: Record<string, unknown>): Promise<void> {
  const directory = artifactDirectory(readerName);
  await mkdir(directory, { recursive: true });
  const require = createRequire(import.meta.url);
  const packageVersion = (name: string) =>
    (JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as { version: string }).version;
  await writeFile(
    join(directory, 'versions.json'),
    `${JSON.stringify(
      {
        reader: readerName,
        ...details,
        guidepupAssets: guidepupAssets(),
        packages: {
          '@guidepup/guidepup': packageVersion('@guidepup/guidepup'),
          '@guidepup/playwright': packageVersion('@guidepup/playwright'),
          '@playwright/test': packageVersion('@playwright/test'),
        },
        runner: {
          os: process.env.RUNNER_OS,
          imageOS: process.env.ImageOS,
          imageVersion: process.env.ImageVersion,
          osRelease: release(),
          arch: process.arch,
          node: process.version,
        },
        targetOrigin: origin,
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * Runs one journey, then writes its spoken phrase log and checks whatever happens. A journey fails when it throws
 * or any speech or focus check fails; the log is written either way.
 */
export async function runJourney(
  readerName: string,
  journal: SpeechJournal,
  page: Page,
  body: () => Promise<void>,
): Promise<void> {
  try {
    await installFocusTrace(page);
    await body();
  } catch (error) {
    journal.error = error instanceof Error ? error.message : String(error);
  }
  const directory = artifactDirectory(readerName);
  await mkdir(directory, { recursive: true });
  if (!journal.passed) {
    await page
      .screenshot({ path: join(directory, `${journal.journey}-failure.png`), fullPage: false })
      .catch(() => undefined);
  }
  await writeFile(join(directory, `${journal.journey}.json`), `${JSON.stringify(journal, null, 2)}\n`);
  const summary = join(directory, 'summary.md');
  const lines = summaryLines(readerName, [journal]);
  await appendFile(summary, `${(existsSync(summary) ? lines.slice(-1) : lines).join('\n')}\n`);
  expect(journal.error, `${journal.journey} did not finish`).toBeUndefined();
  expect(journal.failures, `${journal.journey} speech or focus checks`).toEqual([]);
}
