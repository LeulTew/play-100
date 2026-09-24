import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { collectionFilms } from '../src/lib/films';
import { openBrowsingFilters } from './browsing-helpers';

declare global { interface Window { previousFilm?: HTMLVideoElement } }

test.use({ channel: 'chrome' });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('the public film fragment lands at the section after delayed collection loading without requesting movies', async ({ page }) => {
  const mediaRequests: string[] = [];
  page.on('request', request => { if (/\.mp4(?:$|\?)/.test(request.url())) mediaRequests.push(request.url()); });
  await page.route('**/data/collection.json', async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.goto('/#collection-films');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: 'Watch films', exact: true })).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Watch films', exact: true })).toBeFocused();
  const geometry = await page.locator('#collection-films-title').evaluate(heading => ({
    top: heading.getBoundingClientRect().top,
    headerBottom: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0,
  }));
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom);
  await expect(page.locator('video')).toHaveCount(0);
  expect(mediaRequests).toHaveLength(0);
});

test('optional films stay unloaded until Watch, play and seek natively, switch without overlap and restore focus', async ({ page, isMobile }, info) => {
  await page.setViewportSize({ width: isMobile ? 320 : 1440, height: isMobile ? 851 : 1000 });
  const mediaRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (/\.mp4(?:$|\?)/.test(request.url())) mediaRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(24);
  await expect(page.locator('video')).toHaveCount(0);
  expect(mediaRequests).toHaveLength(0);
  await page.locator('#collection-films').scrollIntoViewIfNeeded();
  await expect(page.locator('.film-watch')).toHaveCount(2);
  await expect.poll(() => page.locator('.film-poster img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 1920))).toBe(true);
  expect(mediaRequests).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#collection-films').screenshot({ path: info.outputPath('films-row.png'), scale: 'css' });
  const opener = page.getByRole('button', { name: 'Watch film: The 100, 22 seconds', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  const video = page.locator('video');
  await expect(dialog.getByRole('heading', { name: 'The 100', exact: true })).toBeFocused();
  for (const [index, film] of collectionFilms.entries()) {
    if (index) await dialog.getByRole('button', { name: `Watch ${film.title}`, exact: true }).click();
    await expect(dialog.getByRole('heading', { name: film.title, exact: true })).toBeFocused();
    await expect(video).toHaveCount(1);
    await expect(video).toHaveAttribute('src', film.video.src);
    await expect.poll(() => video.evaluate((player: HTMLVideoElement) => player.readyState)).toBeGreaterThanOrEqual(1);
    expect(await video.evaluate((player: HTMLVideoElement) => player.paused && !player.autoplay)).toBe(true);
    expect(await video.evaluate((player: HTMLVideoElement) => player.duration)).toBeCloseTo(22, 1);
    if (index) expect(await page.evaluate(() => ({ paused: window.previousFilm?.paused, src: window.previousFilm?.getAttribute('src') }))).toEqual({ paused: true, src: null });
    await video.focus();
    await page.keyboard.press('Space');
    await expect.poll(() => video.evaluate((player: HTMLVideoElement) => player.currentTime)).toBeGreaterThan(0.1);
    expect(await video.evaluate((player: HTMLVideoElement) => player.paused)).toBe(false);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => video.evaluate((player: HTMLVideoElement) => player.currentTime)).toBeGreaterThan(4);
    await page.keyboard.press('Space');
    await expect.poll(() => video.evaluate((player: HTMLVideoElement) => player.paused)).toBe(true);
    await video.evaluate((player: HTMLVideoElement) => { player.textTracks[0].mode = 'showing'; });
    await expect.poll(() => video.evaluate((player: HTMLVideoElement) => player.textTracks[0]?.cues?.length ?? 0)).toBe(1);
    await video.evaluate((player: HTMLVideoElement) => { window.previousFilm = player; });
  }
  await dialog.screenshot({ path: info.outputPath('films-player.png'), scale: 'css' });
  await dialog.getByText('Text alternative & credits', { exact: true }).click();
  await expect(dialog.locator('dl')).toContainText('Play 100');
  const a11y = await new AxeBuilder({ page }).include('.film-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('link', { name: /^Download film/ }).click();
  const download = await downloadPromise;
  const file = await download.path();
  expect(file).toBeTruthy();
  expect(createHash('sha256').update(await readFile(file!)).digest('hex')).toBe(collectionFilms[1].video.sha256);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(video).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => ({ paused: window.previousFilm?.paused, src: window.previousFilm?.getAttribute('src'), overflow: document.body.style.overflow }))).toEqual({ paused: true, src: null, overflow: '' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('poster and media failures keep Watch, retry, text alternatives and downloads usable', async ({ page }) => {
  await page.route('**/videos/*.jpg', route => route.fulfill({ status: 404, body: 'Missing poster fixture' }));
  await page.route('**/videos/*.mp4', route => route.fulfill({ status: 503, body: 'Unavailable media fixture' }));
  await page.goto('/#collection-films');
  await page.locator('#collection-films').scrollIntoViewIfNeeded();
  await expect(page.getByText('Poster unavailable', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Watch film: The 100, 22 seconds', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The film could not load');
  await page.getByText('Text alternative & credits', { exact: true }).click();
  await expect(page.getByRole('dialog').locator('dl')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Download film/ })).toHaveAttribute('download', 'Play-100-the-100.mp4');
  await page.unroute('**/videos/*.mp4');
  await page.getByRole('button', { name: 'Retry film', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'The 100', exact: true })).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.locator('video').evaluate((player: HTMLVideoElement) => player.readyState)).toBeGreaterThanOrEqual(1);
  expect(await page.locator('video').evaluate((player: HTMLVideoElement) => player.paused)).toBe(true);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
});

test('hidden documents pause without resume and navigation unloads the player', async ({ page }) => {
  await page.goto('/?q=Portal');
  await openBrowsingFilters(page);
  await page.getByLabel('Year', { exact: true }).selectOption('2007');
  await page.locator('#collection-films').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Watch film: Discover & compare, 22 seconds', exact: true }).click();
  const video = page.locator('video');
  await expect.poll(() => video.evaluate((player: HTMLVideoElement) => player.readyState)).toBeGreaterThanOrEqual(1);
  await video.focus(); await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate((player: HTMLVideoElement) => player.currentTime)).toBeGreaterThan(0.1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await video.evaluate((player: HTMLVideoElement) => player.paused)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await video.evaluate((player: HTMLVideoElement) => player.paused)).toBe(true);
  await video.evaluate((player: HTMLVideoElement) => { window.previousFilm = player; });
  await page.goBack();
  await expect(page.locator('video')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('year')).toBe(false);
  expect(await page.evaluate(() => window.previousFilm ? { paused: window.previousFilm.paused, src: window.previousFilm.getAttribute('src') } : null)).toEqual({ paused: true, src: null });
});
