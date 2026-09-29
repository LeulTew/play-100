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
      "After sign-in, an active online copy can restore to your account's empty, unchanged device copy.",
      'Pending device edits, stopped saving, deletion or conflicts require your choice before replacement.',
      'Service limits can pause saving, never enable billing automatically.',
      'Existing Off or selected-only choices never become All automatically.',
      'Once All sharing is ready for friends, older app versions cannot save online or stop online saving.',
      'Refresh, or first choose Stop in friend sharing.',
      'Accounts without active All sharing are unaffected; pending device edits are never discarded.',
      'Private counts limit new groups, blocks and reports; account deletion removes these counts.',
    ])
      expect(text).toContain(phrase);
  });

  it('explains offline limits and safe updates without implementation terms', () => {
    for (const phrase of [
      'Offline preparation downloads public app files, collection details',
      'recently viewed app artwork within storage limits.',
      'It excludes private/account data, online-only pages, sign-in details and live catalog results, and never replaces your device library.',
      'Films and workbooks are not downloaded automatically.',
      'Online features need a connection',
      'Updates await your choice and saved edits.',
      'Other app windows or unfinished forms can block reload.',
      'This page never enables offline access.',
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
      'bounded pages',
      'resumable incremental updates',
      'Legacy selected mode',
      'removal-review protection',
    ])
      expect(text).not.toContain(term);
  });

  it('retains sharing limits, revocation, deletion and operational-data exclusions', () => {
    for (const phrase of [
      'Google requests basic identity, email and profile access, not contacts or files.',
      'Online-saving consent lets the creator see your chosen profile and ranking summary, not notes, Play later or play history.',
      'Private library data is stored under your verified account; database operators can access it.',
      'New verified accounts with online saving default to All',
      'Notes, email, Play later and play history stay excluded.',
      'Selected-only sharing allows up to 200 games and asks you to review removals.',
      'All supports the 10,000-game account limit',
      'sharing in small batches that resume after interruptions.',
      'Large libraries may take over a day.',
      'whole-list results stay unknown until complete.',
      'stopping online saving also ends sharing; restarting needs Share all.',
      'Pausing selected-only saving can retain its last shared copy until you stop sharing.',
      'Account exports exclude active invitation links and others',
      'Email, notes, Play later and play history stay excluded.',
      'Guest and online copies remain.',
      'Stopping online saving keeps copies but stops uploads.',
      'Deleting an online copy removes its profile and library and unpublishes its ranking, keeping device recovery data.',
      'Account deletion needs recent sign-in.',
      'If interrupted, the account stays.',
      'Some older shared copies need the site owner',
      'Content-free records remain to prevent old sessions restoring deleted data.',
      'never full URLs, queries, IP addresses, browser details or account IDs.',
      'without account credentials.',
      'never messages or stack traces.',
      'Counts use no device storage or visitor ID',
      'at most 20 errors and four send attempts per page.',
      'not visitor analytics.',
      'Requests exclude private titles, ratings, notes, progress and account IDs.',
      'External scores are neither combined nor treated as yours. Missing data is not zero.',
    ])
      expect(text).toContain(phrase);
  });
});
