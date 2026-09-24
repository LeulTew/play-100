import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FRIEND_ALL_QUOTA_MESSAGE } from '../lib/friend-all';
import { FriendSharingSummary } from './FriendSharingSummary';

const render = (status: string, error: string) => renderToStaticMarkup(createElement(FriendSharingSummary, {
  mode: 'all', status, canEnable: false, enabled: true, error, onEnable: vi.fn(), onStop: vi.fn(), onRefresh: vi.fn(),
}));

describe('friend sharing summary', () => {
  it('shows one quota explanation after the Continuing later label, without an alert or a repeated promise', () => {
    const html = render('quota', FRIEND_ALL_QUOTA_MESSAGE);
    expect(html).toContain('<strong>Continuing later</strong>');
    expect(html.split(FRIEND_ALL_QUOTA_MESSAGE)).toHaveLength(2);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('continue later');
    expect(html).toContain('>Refresh sharing status</button>');
  });
  it('keeps real failures as alerts with a refresh action', () => {
    const html = render('error', 'Synthetic sharing failure');
    expect(html).toContain('<p class="inline-error" role="alert">Synthetic sharing failure</p>');
    expect(html).toContain('>Refresh sharing status</button>');
    expect(html).not.toContain(FRIEND_ALL_QUOTA_MESSAGE);
  });
  it('keeps a quota cooldown storage failure as one alert with Refresh and no quota promise', () => {
    const message = 'The retry cooldown could not be saved. Your device library could not be opened or saved.';
    const html = render('error', message);
    expect(html).toContain('<strong>Needs attention</strong>');
    expect(html.split('role="alert"')).toHaveLength(2);
    expect(html).toContain(`<p class="inline-error" role="alert">${message}</p>`);
    expect(html).not.toContain(FRIEND_ALL_QUOTA_MESSAGE);
    expect(html).toContain('>Refresh sharing status</button>');
  });
  it('shows a failed policy read as a recoverable checking error without any sharing controls', () => {
    const html = renderToStaticMarkup(createElement(FriendSharingSummary, {
      mode: 'checking', status: 'error', canEnable: false, enabled: false, error: 'Synthetic controls read failure',
      onEnable: vi.fn(), onStop: vi.fn(), onRefresh: vi.fn(),
    }));
    expect(html).toContain('<p role="status">Checking friend sharing…</p>');
    expect(html).toContain('<p class="inline-error" role="alert">Synthetic controls read failure</p>');
    expect(html).toContain('>Refresh sharing status</button>');
    expect(html).not.toContain('Share all with friends');
    expect(html).not.toContain('Stop friend sharing');
  });
});
