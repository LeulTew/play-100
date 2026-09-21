import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PublishPage } from './PublishPage';
import type { PublishPageProps } from './PublishPage';
import type { Member, PublicProfile } from '../lib/community';
import { applyPersonalAction, emptyPersonalLibrary } from '../lib/personal-library';
import type { LibraryRecord } from '../lib/personal-types';
import type { AvatarDescriptor } from '../lib/avatar';

const avatar: AvatarDescriptor = { version: 1, seed: '0123456789abcdef0123456789abcdef', palette: 'lime' };
const record: LibraryRecord = { id: 'manual:publication-test', title: 'Publication fixture', year: 2020, genre: '', studio: '', source: 'manual', sourceId: 'publication-test', sourceUrl: null, collectionRank: null };
const state = applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record, score: 8.5 });
const member: Member = { uid: 'alpha', displayName: 'Private member name', avatar, createdAt: 1, updatedAt: 1, consentVersion: 1, rankCount: 1, gameCount: 1 };
const profile: PublicProfile = { uid: 'alpha', displayName: 'Published identity', handle: 'published_handle', title: 'Published picks', avatar, count: 1, preview: [record.title], generation: 'generation', epoch: 0, published: true, listed: true, hidden: false, creator: false, updatedAt: 1 };

function props(patch: Partial<PublishPageProps> = {}): PublishPageProps {
  return {
    social: { control: vi.fn(async () => ({ epoch: 0, hidden: false, deleted: false })), saveMember: vi.fn(async () => {}), publish: vi.fn(async () => profile), unpublish: vi.fn(async () => {}) },
    identity: { uid: 'alpha', email: 'alpha@example.test', displayName: 'Auth name', verified: true, providers: ['password'] },
    member, existing: profile, avatar, state, games: [], isCreator: false, onAccount: vi.fn(), onPublished: vi.fn(), ...patch,
  };
}
function input(html: string, name: string) {
  const match = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`));
  if (!match) throw new Error(`Missing ${name} input.`);
  return match[0];
}

describe('publication field initialization', () => {
  it('uses existing public identity and listing rather than a different private member name', () => {
    const html = renderToStaticMarkup(createElement(PublishPage, props()));
    expect(input(html, 'public-name')).toContain('value="Published identity"');
    expect(input(html, 'public-handle')).toContain('value="published_handle"');
    expect(input(html, 'ranking-title')).toContain('value="Published picks"');
    expect(html.match(/<label class="check-control directory-consent">.*?<\/label>/)?.[0]).toContain('checked=""');
  });
  it('uses the current member for a new profile without enabling directory consent', () => {
    const html = renderToStaticMarkup(createElement(PublishPage, props({ existing: null })));
    expect(input(html, 'public-name')).toContain('value="Private member name"');
    expect(input(html, 'public-handle')).toContain('value=""');
    expect(input(html, 'ranking-title')).toContain('value="My games, my order"');
    expect(html.match(/<label class="check-control directory-consent">.*?<\/label>/)?.[0]).not.toContain('checked');
  });
  it('uses the authenticated name only until a current-scope member or publication is available', () => {
    const html = renderToStaticMarkup(createElement(PublishPage, props({ existing: null, member: null })));
    expect(input(html, 'public-name')).toContain('value="Auth name"');
  });
  it('ignores publication and member props from another identity', () => {
    const html = renderToStaticMarkup(createElement(PublishPage, props({
      identity: { uid: 'beta', email: 'beta@example.test', displayName: 'Beta auth', verified: true, providers: ['password'] },
    })));
    expect(input(html, 'public-name')).toContain('value="Beta auth"');
    expect(input(html, 'public-handle')).toContain('value=""');
    expect(html).not.toContain('Unpublish current ranking');
  });
  it('does not change the existing selection or unverified publication gate', () => {
    const verified = props();
    expect(renderToStaticMarkup(createElement(PublishPage, verified))).toContain('1 of 200 selected');
    const html = renderToStaticMarkup(createElement(PublishPage, { ...verified, identity: { ...verified.identity, verified: false } }));
    expect(html).toContain('Verify before publishing.');
    expect(html).not.toContain('Preview public snapshot');
    expect(verified.social.publish).not.toHaveBeenCalled();
    expect(verified.social.saveMember).not.toHaveBeenCalled();
  });
});
