import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { realpathSync } from 'node:fs';
import { chromium, expect as browserExpect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { createFetchSafeViteServer } from '../lib/test-server-ports';
import { createLibraryBackup, emptyPersonalLibrary } from '../lib/personal-library';
import { MAX_BACKUP_FILE_BYTES } from '../lib/personal-types';

interface RadioFrame {
  checked: string | undefined;
  selected: string | undefined;
  focused: string | undefined;
  disabled: boolean;
}

declare global {
  interface Window {
    settingsRadioFixture: {
      calls: string[];
      frames: RadioFrame[];
      saved(): string;
      inFlight(): number;
      maxInFlight(): number;
      temporary(): void;
      finish(result: boolean | 'reject'): void;
      externalBusy(value: boolean): void;
      restoreCalls: number;
      finishRestore(result: boolean | 'reject'): void;
      resetCalls: number;
      holdReset(): void;
      finishReset(result: boolean | 'reject'): void;
    };
  }
}

// Keep the isolated Vite/Playwright harness: @vitest/browser-playwright is not installed.
// The external fixture module is checked by TypeScript and ESLint without adding a dependency.
const fixture = `<!doctype html><html lang="en" data-motion="off"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Settings radio fixture</title><link rel="icon" href="/favicon.svg">
</head><body><div id="mount"></div><script type="module" src="/src/components/SettingsDialog.browser-fixture.tsx"></script></body></html>`;

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let origin: string;

beforeAll(async () => {
  server = (
    await createFetchSafeViteServer(() =>
      createServer({
        configFile: false,
        root: process.cwd(),
        cacheDir: 'node_modules/.vite-settings-radio-tests',
        logLevel: 'error',
        appType: 'custom',
        optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client'] },
        plugins: [
          react(),
          {
            name: 'settings-radio-fixture',
            configureServer(vite) {
              vite.middlewares.use((request, response, next) => {
                if (request.url !== '/__settings-radio') return next();
                void vite.transformIndexHtml('/__settings-radio', fixture).then((html) => {
                  response.setHeader('Content-Type', 'text/html');
                  response.end(html);
                }, next);
              });
            },
          },
        ],
        server: {
          host: '127.0.0.1',
          port: 0,
          watch: null,
          fs: { allow: [process.cwd(), realpathSync('node_modules')] },
        },
      }),
    )
  ).server;
  expect(server.config.optimizeDeps.noDiscovery).toBe(true);
  expect(server.config.cacheDir).toMatch(/[\\/]node_modules[\\/]\.vite-settings-radio-tests$/);
  expect(server.config.server.watch).toBeNull();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Settings fixture did not bind a local port.');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
}, 30_000);

// Chromium can take tens of seconds to exit on a loaded host; closing beyond 60 s still fails.
afterAll(async () => {
  await browser?.close();
  await server?.close();
}, 60_000);

const radio = (page: Page, value: string) => page.locator(`input[name="visual-experience"][value="${value}"]`);

const unreadableBackupMessage =
  "This backup could not be read as JSON. Choose a file made with Export my library, then try again. Your existing data hasn't changed.";
const unsupportedBackupMessage =
  "This isn't a supported Play 100 backup. Choose a JSON file made with Export my library. Your existing data hasn't changed.";

async function expectBackupImportFailure(page: Page, message: string) {
  const panel = page.locator('.backup-panel');
  await browserExpect(panel.getByRole('alert')).toHaveText(message);
  await browserExpect(panel.locator('.restore-preview')).toHaveCount(0);
  await browserExpect(panel.getByRole('button', { name: 'Import backup', exact: true })).toBeEnabled();
  await browserExpect(panel.getByRole('button', { name: 'Export my library', exact: true })).toBeEnabled();
  await browserExpect(panel.getByLabel('Import personal library backup file')).toHaveValue('');
  expect(await page.evaluate(() => window.settingsRadioFixture.restoreCalls)).toBe(0);
}

for (const mobile of [false, true]) {
  describe(mobile ? 'mobile Settings motion radios' : 'desktop Settings motion radios', () => {
    async function withPage(work: (page: Page) => Promise<void>, timezoneId?: string) {
      if (!browser) throw new Error('Settings fixture browser unavailable.');
      const context = await browser.newContext({
        viewport: { width: mobile ? 393 : 1440, height: mobile ? 851 : 900 },
        isMobile: mobile,
        hasTouch: mobile,
        reducedMotion: 'reduce',
        timezoneId,
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'),
      );
      try {
        await page.goto(`${origin}/__settings-radio`);
        await browserExpect(
          page
            .getByRole('dialog', { name: 'Settings & backups', exact: true })
            .getByRole('heading', { name: 'Settings & backups', level: 2, exact: true }),
        ).toBeFocused();
        await work(page);
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }

    it('focuses Keep my data, reveals the entire confirmation and returns focus after cancel', async () => {
      await withPage(async (page) => {
        const settings = page.getByRole('dialog', { name: 'Settings & backups', exact: true });
        await browserExpect(settings.locator('.dialog-lead')).toHaveText(
          'Backups, offline access and display settings for this device.',
        );
        await browserExpect(settings.locator('.device-settings')).toContainText('0 in Play later · 0 completed.');
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(mobile);
        const trigger = settings.getByRole('button', { name: 'Reset device data', exact: true });
        if (mobile) await trigger.tap();
        else {
          await trigger.focus();
          await page.keyboard.press('Enter');
        }
        const keep = settings.getByRole('button', { name: 'Keep my data', exact: true });
        await browserExpect(keep).toBeFocused();
        const geometry = await settings.evaluate((dialog) => {
          const panel = dialog.querySelector('.reset-confirmation')!;
          const bounds = panel.getBoundingClientRect();
          return {
            top: bounds.top,
            bottom: bounds.bottom,
            viewTop: dialog.querySelector('.dialog-close-rail')!.getBoundingClientRect().bottom,
            viewBottom: Math.min(innerHeight, dialog.getBoundingClientRect().bottom),
            width: innerWidth,
            height: innerHeight,
            controls: [...panel.querySelectorAll('button')].map((button) => {
              const rect = button.getBoundingClientRect();
              return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
            }),
          };
        });
        expect(geometry.width).toBe(mobile ? 393 : 1440);
        expect(geometry.height).toBe(mobile ? 851 : 900);
        expect(geometry.top).toBeGreaterThanOrEqual(geometry.viewTop);
        expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewBottom);
        expect(geometry.controls).toEqual([true, true]);
        await keep.press('Enter');
        await browserExpect(settings.locator('.reset-confirmation')).toHaveCount(0);
        await browserExpect(trigger).toBeFocused();
        expect(await page.evaluate(() => window.settingsRadioFixture.resetCalls)).toBe(0);
      });
    });

    it.each([true, false, 'reject'] as const)(
      'keeps pending reset focus, ignores repeats and returns to the trigger on result %s',
      async (result) => {
        await withPage(async (page) => {
          await page.evaluate(() => window.settingsRadioFixture.holdReset());
          const trigger = page.getByRole('button', { name: 'Reset device data', exact: true });
          await trigger.click();
          const keep = page.getByRole('button', { name: 'Keep my data', exact: true });
          await browserExpect(keep).toBeFocused();
          const reset = page.getByRole('button', { name: 'Yes, reset device data', exact: true });
          await reset.focus();
          await reset.press('Enter');
          await browserExpect(reset).toHaveAttribute('aria-disabled', 'true');
          await browserExpect(keep).toHaveAttribute('aria-disabled', 'true');
          await browserExpect(reset).toBeFocused();
          await reset.press('Enter');
          await keep.press('Enter');
          expect(await page.evaluate(() => window.settingsRadioFixture.resetCalls)).toBe(1);
          await browserExpect(page.locator('.reset-confirmation')).toBeVisible();
          await page.evaluate((value) => window.settingsRadioFixture.finishReset(value), result);
          await browserExpect(page.locator('.reset-confirmation')).toHaveCount(0);
          await browserExpect(trigger).toBeFocused();
          await browserExpect(
            page.locator('.device-settings').getByRole(result === true ? 'status' : 'alert'),
          ).toHaveText(
            result === true
              ? 'Your active library, Play later, ranking, Compare pins and preferences have been reset.'
              : 'Reset failed. Your saved data has not been removed.',
          );
        });
      },
    );

    it('does not reclaim focus when a reset finishes after Settings has closed', async () => {
      await withPage(async (page) => {
        await page.evaluate(() => window.settingsRadioFixture.holdReset());
        await page.getByRole('button', { name: 'Reset device data', exact: true }).click();
        await page.getByRole('button', { name: 'Yes, reset device data', exact: true }).click();
        await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
        const next = page.getByRole('button', { name: 'Continue browsing', exact: true });
        await next.focus();
        await page.evaluate(() => window.settingsRadioFixture.finishReset(true));
        await browserExpect(page.getByRole('dialog')).toHaveCount(0);
        await browserExpect(next).toBeFocused();
      });
    });

    for (const action of ['Export my library', 'Import backup'] as const) {
      it(`${action} clears the previous reset result when it starts`, async () => {
        await withPage(async (page) => {
          await page.getByRole('button', { name: 'Reset device data', exact: true }).click();
          await page.getByRole('button', { name: 'Yes, reset device data', exact: true }).click();
          const resetStatus = page.locator('.device-settings').getByRole('status');
          await browserExpect(resetStatus).toHaveText(
            'Your active library, Play later, ranking, Compare pins and preferences have been reset.',
          );
          if (action === 'Export my library') {
            const pending = page.waitForEvent('download');
            await page.getByRole('button', { name: action, exact: true }).click();
            expect(await (await pending).failure()).toBeNull();
          } else {
            const pending = page.waitForEvent('filechooser');
            await page.getByRole('button', { name: action, exact: true }).click();
            await pending;
          }
          await browserExpect(resetStatus).toHaveCount(0);
          await browserExpect(page.getByRole('dialog')).toBeVisible();
        });
      });
    }

    it.each([
      ['Etc/GMT-3', '2026-09-29T21:29:00.000Z', -180, '2026-09-30'],
      ['Etc/GMT+8', '2026-10-01T00:29:00.000Z', 480, '2026-09-30'],
      ['Etc/GMT-3', '2026-12-31T21:29:00.000Z', -180, '2027-01-01'],
    ] as const)('dates a backup by the local calendar in %s at %s', async (zone, instant, offset, date) => {
      await withPage(async (page) => {
        await page.clock.setFixedTime(new Date(instant));
        expect(await page.evaluate(() => new Date().getTimezoneOffset())).toBe(offset);
        const pending = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export my library', exact: true }).click();
        const download = await pending;
        expect(download.suggestedFilename()).toBe(`Play-100-My-Library-${date}.json`);
        expect(await download.failure()).toBeNull();
      }, zone);
    });

    it('separates each visible preference label from its supporting description in the exact name', async () => {
      await withPage(async (page) => {
        for (const [name, description] of [
          ['Auto', 'Touchscreens start 3D on demand.'],
          ['Full', 'The interactive 3D collection.'],
          ['Lite', 'Original static art. No effects.'],
        ] as const) {
          const option = page.getByRole('radio', { name, exact: true });
          await browserExpect(option).toHaveCount(1);
          await browserExpect(option).toHaveAccessibleDescription(description);
          await browserExpect(option).not.toHaveAttribute('aria-label');
        }
      });
    });

    it.each([
      ['malformed JSON', '{not json', unreadableBackupMessage],
      ['unsupported JSON', '{"version":0,"games":[]}', unsupportedBackupMessage],
      [
        'unsupported version',
        JSON.stringify({ ...createLibraryBackup(emptyPersonalLibrary()), formatVersion: 99 }),
        unsupportedBackupMessage,
      ],
    ] as const)('gives a recovery step for an import with %s without replacing data', async (kind, text, message) => {
      await withPage(async (page) => {
        const panel = page.locator('.backup-panel');
        const input = panel.getByLabel('Import personal library backup file');
        await input.setInputFiles({
          name: `${kind}.json`,
          mimeType: 'application/json',
          buffer: Buffer.from(text),
        });
        await expectBackupImportFailure(page, message);
        await input.setInputFiles({
          name: 'supported-backup.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(createLibraryBackup(emptyPersonalLibrary()))),
        });
        await browserExpect(panel.locator('.restore-preview')).toBeVisible();
        await browserExpect(panel.getByRole('alert')).toHaveCount(0);
        expect(await page.evaluate(() => window.settingsRadioFixture.restoreCalls)).toBe(0);
      });
    });

    it('explains an unreadable backup file without appending the file-system error', async () => {
      await withPage(async (page) => {
        const original = await page.evaluateHandle(() => File.prototype.text);
        try {
          await page.evaluate(() => {
            File.prototype.text = () =>
              Promise.reject(new DOMException('Synthetic file-system detail.', 'NotReadableError'));
          });
          await page.getByLabel('Import personal library backup file').setInputFiles({
            name: 'unreadable-backup.json',
            mimeType: 'application/json',
            buffer: Buffer.from('{}'),
          });
          await expectBackupImportFailure(page, unreadableBackupMessage);
        } finally {
          await original.evaluate((read) => {
            File.prototype.text = read;
          });
          await original.dispose();
        }
      });
    });

    it('keeps the size-limit refusal and rejects an oversized file before reading it', async () => {
      await withPage(async (page) => {
        const probe = await page.evaluateHandle((size) => {
          const originalSize = Object.getOwnPropertyDescriptor(File.prototype, 'size');
          const originalText = File.prototype.text;
          const observation = {
            reads: 0,
            restore() {
              File.prototype.text = originalText;
              if (originalSize) Object.defineProperty(File.prototype, 'size', originalSize);
              else Reflect.deleteProperty(File.prototype, 'size');
            },
          };
          Object.defineProperty(File.prototype, 'size', { configurable: true, get: () => size });
          File.prototype.text = function () {
            observation.reads += 1;
            return originalText.call(this);
          };
          return observation;
        }, MAX_BACKUP_FILE_BYTES + 1);
        try {
          await page.getByLabel('Import personal library backup file').setInputFiles({
            name: 'oversized-backup.json',
            mimeType: 'application/json',
            buffer: Buffer.from('{}'),
          });
          await expectBackupImportFailure(
            page,
            'This backup file exceeds the 24 MB import limit. No data was changed.',
          );
          expect(await probe.evaluate((observation) => observation.reads)).toBe(0);
        } finally {
          await probe.evaluate((observation) => observation.restore());
          await probe.dispose();
        }
      });
    });

    it('retains a refused backup preview and clears its failure alert after a successful retry', async () => {
      await withPage(async (page) => {
        const panel = page.locator('.backup-panel');
        await panel.getByLabel('Import personal library backup file').setInputFiles({
          name: 'synthetic-empty-backup.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(createLibraryBackup(emptyPersonalLibrary()))),
        });
        const restore = panel.getByRole('button', { name: 'Replace with this backup', exact: true });
        await restore.click();
        await browserExpect(restore).toHaveAttribute('aria-disabled', 'true');
        await browserExpect(restore).toBeFocused();
        await page.evaluate(() => window.settingsRadioFixture.finishRestore(false));
        await browserExpect(panel.getByRole('alert')).toHaveText(
          'Restore failed. Your existing library was not replaced.',
        );
        await browserExpect(panel.locator('.restore-preview')).toBeVisible();
        await browserExpect(page.getByRole('dialog')).toBeVisible();
        await restore.click();
        await browserExpect(panel.getByRole('alert')).toHaveCount(0);
        await page.evaluate(() => window.settingsRadioFixture.finishRestore(true));
        await browserExpect(panel.getByRole('status')).toHaveText('Your backup was restored and saved on this device.');
        await browserExpect(panel.getByRole('alert')).toHaveCount(0);
        await browserExpect(panel.locator('.restore-preview')).toHaveCount(0);
        await browserExpect(panel.getByRole('button', { name: 'Import backup', exact: true })).toBeFocused();
        await browserExpect(page.getByRole('dialog')).toBeVisible();
        expect(await page.evaluate(() => window.settingsRadioFixture.restoreCalls)).toBe(2);
      });
    });

    it('returns keyboard focus to Import backup when a preview is cancelled', async () => {
      await withPage(async (page) => {
        const panel = page.locator('.backup-panel');
        await panel.getByLabel('Import personal library backup file').setInputFiles({
          name: 'cancelled-backup.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(createLibraryBackup(emptyPersonalLibrary()))),
        });
        const cancel = panel.getByRole('button', { name: 'Cancel import', exact: true });
        await cancel.focus();
        await cancel.press('Enter');
        await browserExpect(panel.locator('.restore-preview')).toHaveCount(0);
        await browserExpect(panel.getByRole('button', { name: 'Import backup', exact: true })).toBeFocused();
        expect(await page.evaluate(() => window.settingsRadioFixture.restoreCalls)).toBe(0);
      });
    });

    it.each([true, false, 'reject'] as const)(
      'keeps restore focus and guards repeats while completing with %s',
      async (result) => {
        await withPage(async (page) => {
          const panel = page.locator('.backup-panel');
          await panel.getByLabel('Import personal library backup file').setInputFiles({
            name: 'held-backup.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(createLibraryBackup(emptyPersonalLibrary()))),
          });
          const restore = panel.getByRole('button', { name: 'Replace with this backup', exact: true });
          const cancel = panel.getByRole('button', { name: 'Cancel import', exact: true });
          await restore.focus();
          await restore.press('Enter');
          await browserExpect(restore).toHaveAttribute('aria-disabled', 'true');
          await browserExpect(restore).toBeFocused();
          await restore.press('Enter');
          await cancel.press('Enter');
          expect(await page.evaluate(() => window.settingsRadioFixture.restoreCalls)).toBe(1);
          await browserExpect(panel.locator('.restore-preview')).toBeVisible();
          await restore.focus();
          await page.evaluate((value) => window.settingsRadioFixture.finishRestore(value), result);
          if (result === true) {
            await browserExpect(panel.locator('.restore-preview')).toHaveCount(0);
            await browserExpect(panel.getByRole('button', { name: 'Import backup', exact: true })).toBeFocused();
            await browserExpect(panel.getByRole('status')).toHaveText(
              'Your backup was restored and saved on this device.',
            );
          } else {
            await browserExpect(restore).toBeFocused();
            await browserExpect(restore).not.toHaveAttribute('aria-disabled', 'true');
            await browserExpect(panel.getByRole('alert')).toHaveText(
              'Restore failed. Your existing library was not replaced.',
            );
          }
        });
      },
    );

    it('does not refocus an import after the Settings dialog has closed', async () => {
      await withPage(async (page) => {
        await page.getByLabel('Import personal library backup file').setInputFiles({
          name: 'late-backup.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(createLibraryBackup(emptyPersonalLibrary()))),
        });
        await page.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
        await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
        const next = page.getByRole('button', { name: 'Continue browsing', exact: true });
        await next.focus();
        await page.evaluate(() => window.settingsRadioFixture.finishRestore(true));
        await browserExpect(next).toBeFocused();
        await browserExpect(page.getByRole('dialog')).toHaveCount(0);
      });
    });

    it('keeps the clicked value and selected class for both pending frames without disabling its focus', async () => {
      await withPage(async (page) => {
        await radio(page, 'lite').click();
        await browserExpect.poll(() => page.evaluate(() => window.settingsRadioFixture.frames.length)).toBe(2);
        expect(await page.evaluate(() => window.settingsRadioFixture.frames)).toEqual([
          { checked: 'lite', selected: 'lite', focused: 'lite', disabled: false },
          { checked: 'lite', selected: 'lite', focused: 'lite', disabled: false },
        ]);
        await browserExpect(radio(page, 'lite')).toBeEnabled();
        await browserExpect(radio(page, 'lite')).not.toHaveAttribute('aria-disabled', 'true');
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['lite']);
        await page.evaluate(() => window.settingsRadioFixture.finish(true));
        await browserExpect(radio(page, 'lite')).toBeChecked();
        await browserExpect(radio(page, 'lite')).not.toHaveAttribute('aria-disabled', 'true');
      });
    });

    it.each([
      ['ArrowDown', 'full'],
      ['ArrowUp', 'lite'],
    ] as const)('%s keeps the newly selected %s radio focused throughout its save', async (key, selected) => {
      await withPage(async (page) => {
        await radio(page, 'auto').focus();
        await page.keyboard.press(key);
        await browserExpect.poll(() => page.evaluate(() => window.settingsRadioFixture.frames.length)).toBe(2);
        expect(await page.evaluate(() => window.settingsRadioFixture.frames)).toEqual([
          { checked: selected, selected, focused: selected, disabled: false },
          { checked: selected, selected, focused: selected, disabled: false },
        ]);
        await browserExpect(radio(page, selected)).toBeFocused();
        await page.evaluate(() => window.settingsRadioFixture.finish(true));
        await browserExpect(radio(page, selected)).not.toHaveAttribute('aria-disabled', 'true');
        await browserExpect(radio(page, selected)).toBeFocused();
        await browserExpect(radio(page, selected)).toBeChecked();
      });
    });

    it('coalesces queued choices back to the in-flight value without a duplicate save', async () => {
      await withPage(async (page) => {
        await radio(page, 'full').click();
        await page.keyboard.press('ArrowDown');
        await browserExpect(radio(page, 'lite')).toBeChecked();
        await page.keyboard.press('ArrowUp');
        await browserExpect(radio(page, 'full')).toBeChecked();
        await browserExpect(radio(page, 'full')).toBeFocused();
        await page.evaluate(() => window.settingsRadioFixture.finish(true));
        await browserExpect.poll(() => page.evaluate(() => window.settingsRadioFixture.saved())).toBe('full');
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['full']);
        expect(await page.evaluate(() => window.settingsRadioFixture.inFlight())).toBe(0);
        await browserExpect(radio(page, 'full')).toBeFocused();
      });
    });

    it.each([true, false])(
      'announces only the completed latest choice inside Settings (persistent=%s)',
      async (persistent) => {
        await withPage(async (page) => {
          if (!persistent) await page.evaluate(() => window.settingsRadioFixture.temporary());
          const status = page.locator('.settings-dialog .dialog-inner > [role="status"]');
          await radio(page, 'full').click();
          await radio(page, 'lite').click();
          await browserExpect(status).not.toContainText('Visual preference saved.');
          await page.evaluate(() => window.settingsRadioFixture.finish(true));
          await browserExpect
            .poll(() => page.evaluate(() => window.settingsRadioFixture.calls))
            .toEqual(['full', 'lite']);
          await browserExpect(status).not.toContainText('Visual preference saved.');
          await page.evaluate(() => window.settingsRadioFixture.finish(true));
          await browserExpect(status).toContainText(
            `Visual preference saved.${persistent ? '' : ' This tab only: export a backup to keep it.'}`,
          );
          await browserExpect(status).toContainText('Existing Settings status.');
          await browserExpect(radio(page, 'lite')).toBeChecked();
          await browserExpect(radio(page, 'lite')).toBeFocused();
          await browserExpect(page.getByRole('status').filter({ hasText: 'Visual preference saved.' })).toHaveCount(1);
        });
      },
    );

    it.each([
      ['ArrowDown', 'lite'],
      ['ArrowUp', 'auto'],
    ] as const)('saves the latest %s choice %s after the held save without losing focus', async (key, latest) => {
      await withPage(async (page) => {
        await radio(page, 'full').click();
        await page.keyboard.press(key);
        await browserExpect.poll(() => page.evaluate(() => window.settingsRadioFixture.frames.length)).toBe(2);
        expect(await page.evaluate(() => window.settingsRadioFixture.frames)).toEqual([
          { checked: latest, selected: latest, focused: latest, disabled: false },
          { checked: latest, selected: latest, focused: latest, disabled: false },
        ]);
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['full']);
        await page.evaluate(() => window.settingsRadioFixture.finish(true));
        await browserExpect
          .poll(() => page.evaluate(() => window.settingsRadioFixture.calls))
          .toEqual(['full', latest]);
        expect(await page.evaluate(() => window.settingsRadioFixture.saved())).toBe('full');
        expect(await page.evaluate(() => window.settingsRadioFixture.inFlight())).toBe(1);
        await browserExpect(radio(page, latest)).toBeChecked();
        await browserExpect(radio(page, latest)).toBeFocused();
        await browserExpect(radio(page, latest)).toBeEnabled();
        await page.evaluate(() => window.settingsRadioFixture.finish(true));
        await browserExpect.poll(() => page.evaluate(() => window.settingsRadioFixture.saved())).toBe(latest);
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['full', latest]);
        expect(await page.evaluate(() => window.settingsRadioFixture.inFlight())).toBe(0);
        expect(await page.evaluate(() => window.settingsRadioFixture.maxInFlight())).toBe(1);
        await browserExpect(radio(page, latest)).toBeChecked();
        await browserExpect(radio(page, latest)).toBeFocused();
        await page.evaluate(() => window.settingsRadioFixture.externalBusy(true));
        await browserExpect(radio(page, latest)).toBeDisabled();
      });
    });

    it.each([false, 'reject'] as const)('drops the queued choice when the held save fails with %s', async (result) => {
      await withPage(async (page) => {
        await radio(page, 'full').click();
        await page.keyboard.press('ArrowDown');
        await browserExpect(radio(page, 'lite')).toBeChecked();
        await browserExpect(radio(page, 'lite')).toBeFocused();
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['full']);
        await page.evaluate((value) => window.settingsRadioFixture.finish(value), result);
        await browserExpect(radio(page, 'auto')).toBeChecked();
        await browserExpect(page.locator('.motion-option.selected input')).toHaveValue('auto');
        await browserExpect(radio(page, 'lite')).toBeFocused();
        await browserExpect(page.locator('.settings-dialog .dialog-inner > [role="status"]')).toContainText(
          'Your visual experience could not be saved.',
        );
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['full']);
        expect(await page.evaluate(() => window.settingsRadioFixture.inFlight())).toBe(0);
        expect(await page.evaluate(() => window.settingsRadioFixture.saved())).toBe('auto');
        await radio(page, 'full').click();
        await page.evaluate(() => window.settingsRadioFixture.finish(true));
        await browserExpect.poll(() => page.evaluate(() => window.settingsRadioFixture.saved())).toBe('full');
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['full', 'full']);
        expect(await page.evaluate(() => window.settingsRadioFixture.inFlight())).toBe(0);
      });
    });

    it.each([false, 'reject'] as const)(
      'reverts and announces failed save %s in the existing status region, then retries',
      async (result) => {
        await withPage(async (page) => {
          await radio(page, 'lite').click();
          await browserExpect(radio(page, 'lite')).toBeChecked();
          await page.evaluate((value) => window.settingsRadioFixture.finish(value), result);
          await browserExpect(radio(page, 'auto')).toBeChecked();
          await browserExpect(page.locator('.motion-option.selected input')).toHaveValue('auto');
          await browserExpect(radio(page, 'lite')).toBeFocused();
          const status = page.locator('.settings-dialog .dialog-inner > [role="status"]');
          await browserExpect(status).toHaveCount(1);
          await browserExpect(status).toContainText('Existing Settings status.');
          await browserExpect(status).toContainText('Your visual experience could not be saved.');
          await browserExpect(status).not.toContainText('Visual preference saved.');
          await radio(page, 'lite').click();
          await browserExpect(status).not.toContainText('Your visual experience could not be saved.');
          await page.evaluate(() => window.settingsRadioFixture.finish(true));
          await browserExpect(radio(page, 'lite')).not.toHaveAttribute('aria-disabled', 'true');
          await browserExpect(radio(page, 'lite')).toBeChecked();
          expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual(['lite', 'lite']);
        });
      },
    );

    it('still disables the group for unrelated library work', async () => {
      await withPage(async (page) => {
        await page.evaluate(() => window.settingsRadioFixture.externalBusy(true));
        for (const value of ['auto', 'full', 'lite']) await browserExpect(radio(page, value)).toBeDisabled();
        expect(await page.evaluate(() => window.settingsRadioFixture.calls)).toEqual([]);
        await page.evaluate(() => window.settingsRadioFixture.externalBusy(false));
        await browserExpect(radio(page, 'auto')).toBeEnabled();
      });
    });
  });
}
