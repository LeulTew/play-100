import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DataUseContent from './DataUseContent';

const text = renderToStaticMarkup(createElement(DataUseContent))
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&');

describe('data use explanation', () => {
  it('explains restore, service limits, consent and older versions in plain words', () => {
    for (const phrase of [
      'account and guest libraries stay separate.',
      "An existing active online copy can restore into your account's empty, unchanged copy on this device after sign-in.",
      'Copies with pending local edits, stopped saving, deleted data and conflicts require your choice before replacement.',
      'The online service has usage limits. If a limit is reached, saving may pause; billing is not enabled automatically.',
      'Existing off and selected-only choices stay unchanged; a choice made before All mode existed is never treated as consent to All.',
      "While friends can see a finished All-sharing view, an older version of the app can't save changes online or stop online saving. Refresh the app, or first use friend sharing's Stop in that version.",
      "Accounts without active All sharing aren't affected, and pending local edits are never discarded.",
      'Private counters limit new groups, blocks and reports; they are removed when the account is deleted.',
    ])
      expect(text).toContain(phrase);
  });

  it('explains offline limits and safe updates without implementation terms', () => {
    for (const phrase of [
      'Offline preparation downloads public app files, collection details',
      'recently viewed artwork included with the app, within storage limits.',
      'It does not download private or account data, online-only pages, sign-in details or live catalog results for offline use, or replace your existing device library.',
      'Films and workbooks are not downloaded automatically.',
      'Online features still need a connection',
      'Updates wait for your choice and for edits to save successfully',
      'another open app window or unfinished form can prevent a reload.',
      'Opening this page does not turn on offline access.',
    ])
      expect(text).toContain(phrase);
  });

  it('keeps internal storage and protocol terms out of the explanation', () => {
    for (const term of [
      'guest scope',
      'account cache',
      'Dirty copies',
      'safe choice',
      "Firebase's free quotas",
      'Quota exhaustion',
      'absent new settings',
      'atomically',
      'safety signal',
      'Private count records',
      'bounded public app shell',
      'offline worker',
      'live-provider responses',
      'catalog API responses',
    ])
      expect(text).not.toContain(term);
  });
});
