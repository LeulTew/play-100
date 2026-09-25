import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from './AuthPanel';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState) };
});

afterEach(() => {
  vi.mocked(useState).mockReset();
});

function render(purpose?: 'compare', busy = false) {
  const props = {
    busy,
    error: '',
    message: '',
    purpose,
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
