import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from './AuthPanel';

vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState) };
});

afterEach(() => { vi.mocked(useState).mockClear(); });

function render(purpose?: 'compare', busy = false) {
  const props = {
    busy, error: '', message: '', purpose,
    onGoogle: vi.fn(async () => true), onEmail: vi.fn(async () => true),
    onReset: vi.fn(async () => true), onDevice: vi.fn(),
  };
  return { html: renderToStaticMarkup(createElement(AuthPanel, props)), props };
}

describe('AuthPanel purpose', () => {
  it.each([false, true])('uses exact progress copy with email mode %s', emailMode => {
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
});
