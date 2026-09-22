import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuthPanel } from './AuthPanel';

function render(purpose?: 'compare') {
  const props = {
    busy: false, error: '', message: '', purpose,
    onGoogle: vi.fn(async () => true), onEmail: vi.fn(async () => true),
    onReset: vi.fn(async () => true), onDevice: vi.fn(),
  };
  return { html: renderToStaticMarkup(createElement(AuthPanel, props)), props };
}

describe('AuthPanel purpose', () => {
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
