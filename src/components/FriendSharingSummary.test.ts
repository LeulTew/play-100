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
});
