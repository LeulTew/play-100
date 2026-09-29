import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from './AuthPanel';
import { reportDeviceLeftovers, retryDeviceLeftovers, withdrawDeviceLeftovers } from './device-leftovers';
import type { DeviceCopyRemoval } from '../lib/scoped-library';
import type { AuthPurpose } from '../lib/sign-in-purpose';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState) };
});

afterEach(() => {
  vi.mocked(useState).mockReset();
  withdrawDeviceLeftovers();
});

function render(purpose?: AuthPurpose, busy = false, games?: number) {
  const props = {
    busy,
    error: '',
    message: '',
    purpose,
    games,
    onGoogle: vi.fn(async () => true),
    onEmail: vi.fn(async () => true),
    onReset: vi.fn(async () => true),
    onDevice: vi.fn(),
  };
  return { html: renderToStaticMarkup(createElement(AuthPanel, props)), props };
}

describe('AuthPanel purpose', () => {
  it.each([false, true])('uses exact progress copy with email mode %s', (emailMode) => {
    // Select the email-mode state for this static render without changing the component API.
    vi.mocked(useState).mockReturnValueOnce([emailMode, vi.fn()]);
    const { html } = render(undefined, true);
    expect(html).toContain('<p class="google-continuation" role="status">Connecting…</p>');
    if (emailMode) {
      expect(html).toContain('class="button button-dark auth-submit" disabled="" type="submit">Please wait…<svg');
    } else {
      expect(html).not.toContain('auth-submit');
    }
  });

  it('explains friends rankings before provider choices without initiating authentication', () => {
    const { html, props } = render('compare');
    expect(html).toContain('Compare friends&#x27; rankings');
    expect(html).toContain('Sign in to compare rankings shared by your friends.');
    expect(html).toContain('Pins select games for comparison; they do not share your library.');
    expect(html.indexOf('Compare friends')).toBeLessThan(html.indexOf('Continue with Google'));
    expect(html).toContain('Keep using this device');
    expect(html).toContain('Signing in does not publish your library.');
    expect(props.onGoogle).not.toHaveBeenCalled();
    expect(props.onEmail).not.toHaveBeenCalled();
    expect(props.onReset).not.toHaveBeenCalled();
    expect(props.onDevice).not.toHaveBeenCalled();
  });

  it('leaves ordinary account sign-in unchanged', () => {
    const { html } = render();
    expect(html).not.toContain('auth-purpose');
    expect(html).toContain('Continue with Google');
    expect(html).toContain('Use email');
    expect(html).toContain('Keep using this device');
  });

  it.each([
    [
      'account',
      'Sign in to save your games and rankings online and use them on your other devices. Your library stays on this device until you turn on online saving.',
    ],
    [
      'friends',
      'Add friends with an invite link, see the games they share and compare your rankings. Sign in so your friends can find you.',
    ],
    [
      'publish',
      'Publish your ranking as a public page that anyone with its link can see, and choose whether Community lists it. Sign in so the page belongs to you.',
    ],
    [
      'friend-sharing',
      'Choose the ranked games, with their order and scores, that your friends can see. Sign in to share them with friends.',
    ],
    [
      'friend-shelf',
      'Choose saved games from your library for your friends to see. Sign in to share them with friends.',
    ],
    [
      'creator',
      'The collection creator can review consenting members and moderate public rankings here. Sign in with the creator account to continue.',
    ],
  ] as const)('says what the signed-out %s page is for before provider choices', (purpose, text) => {
    const { html, props } = render(purpose);
    // The page's own heading names it, so its purpose is one paragraph with no heading of its own.
    expect(html).toContain(`<div class="auth-purpose"><p>${text}</p></div>`);
    expect(html.indexOf(text)).toBeLessThan(html.indexOf('Continue with Google'));
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('pinned');
    expect(html).not.toMatch(/[\u2018\u2019\u201C\u201D]/);
    expect(html).toContain('Keep using this device');
    expect(props.onGoogle).not.toHaveBeenCalled();
    expect(props.onEmail).not.toHaveBeenCalled();
  });

  it.each([
    [1, 'Sign in to compare your pinned game with friends.'],
    [3, 'Sign in to compare your 3 pinned games with friends.'],
  ] as const)('names the %i game(s) the Compare tray holds before provider choices', (games, text) => {
    const { html } = render('compare', false, games);
    expect(html).toContain(text);
    expect(html).toContain('Pins select games for comparison; they do not share your library.');
    expect(html).not.toContain('Sign in to compare rankings shared by your friends.');
    expect(html.indexOf(text)).toBeLessThan(html.indexOf('Continue with Google'));
    // Only a Compare sign-in names pins.
    expect(render(undefined, false, games).html).not.toContain('pinned');
  });

  it('renders the decorative Google mark inline without network images or inline styles', () => {
    const { html } = render();
    const button = html.match(/<button\b[^>]*class="google-signin"[^>]*>([\s\S]*?)<\/button>/)?.[1];
    expect(button).toBeDefined();
    expect(button).toContain('<svg width="20" height="20" viewBox="0 0 118 120" aria-hidden="true" focusable="false">');
    expect(button?.match(/<path\b/g)).toHaveLength(5);
    for (const color of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) expect(button).toContain(`fill="${color}"`);
    expect(button).not.toMatch(/<img\b|<style\b|<script\b|\bstyle=|\b(?:href|src)=/);
    expect(button?.replace(/<[^>]+>/g, '').trim()).toBe('Continue with Google');
  });
});

// G8-SEC-AUDIT F1: after an account's sign-out or deletion left some of its data on this device.
describe('AuthPanel device leftovers', () => {
  it.each([
    ['sign-out', 'Signed out, but some of this account&#x27;s data is still on this device.'],
    ['deletion', 'Your account is deleted, but some of its data is still on this device.'],
  ] as const)('says what a %s left, retries that account, then confirms it or explains', (after, text) => {
    let removed = false;
    const retry = vi.fn<() => DeviceCopyRemoval>();
    retry.mockImplementation(() => (removed ? { complete: true } : { complete: false, retry }));
    expect(render().html).not.toContain('account-notice');
    reportDeviceLeftovers(after, retry);
    const left = render().html;
    expect(left).toContain(
      `<section class="account-notice" role="alert" tabindex="-1"><p>${text}</p><button class="button button-outline" type="button">Try again</button></section>`,
    );
    expect(left.indexOf('Try again')).toBeLessThan(left.indexOf('Continue with Google'));
    expect(retry).not.toHaveBeenCalled();
    void retryDeviceLeftovers();
    expect(render().html).toContain(
      `<p>${text} Trying again didn&#x27;t work. To remove it, clear this site&#x27;s data in your browser settings.</p><button class="button button-outline" type="button">Try again</button>`,
    );
    removed = true;
    void retryDeviceLeftovers();
    const done = render().html;
    // The same live region confirms the removal, so focus has somewhere to stay once its button goes.
    expect(done).toContain(
      '<section class="account-notice" role="alert" tabindex="-1"><p>That account&#x27;s data is now removed from this device.</p></section>',
    );
    expect(done).not.toContain('Try again');
    void retryDeviceLeftovers();
    expect(retry).toHaveBeenCalledTimes(2);
    withdrawDeviceLeftovers();
    expect(render().html).not.toContain('account-notice');
  });
});
