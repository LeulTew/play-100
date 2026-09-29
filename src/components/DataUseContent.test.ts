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
      'If the service reaches its free limit, online saving pauses; billing is never turned on.',
      'If you previously turned sharing off or chose specific games, that choice stays in place.',
      'When sharing everything with friends is active, older app versions cannot save online or stop online saving.',
      'Refresh the app, or first choose Stop in Friend sharing.',
      "Accounts that aren't sharing everything are unaffected; pending device edits are never discarded.",
      'Private counts limit new groups, blocks and reports; account deletion removes these counts.',
    ])
      expect(text).toContain(phrase);
  });

  it('explains offline limits and safe updates without implementation terms', () => {
    for (const phrase of [
      'Offline preparation downloads public app files, collection details',
      'recently viewed app artwork within storage limits.',
      'It excludes private data, account data, online-only pages, sign-in details and live catalog results, and never replaces your device library.',
      'Films and workbooks are not downloaded automatically.',
      'Online features need a connection',
      'Updates wait until you choose to apply them and your edits have saved.',
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
      'Content-free',
      'In All',
      'Backups:',
      'Exports/deletion:',
    ])
      expect(text).not.toContain(term);
    expect(text).not.toMatch(/\w\s*\/\s*\w/);
  });

  it('retains sharing limits, revocation, deletion and operational-data exclusions', () => {
    for (const phrase of [
      'Google requests basic identity, email and profile access, not contacts or files.',
      'Online-saving consent lets the creator see your chosen profile and ranking summary, not notes, Play later or play history.',
      'Private library data is stored under your verified account; database operators can access it.',
      'New verified accounts with online saving share all saved game details and rankings with accepted friends by default, including future additions.',
      'Notes, email, Play later and play history stay excluded.',
      'Selected-only sharing allows up to 200 games and asks you to review removals.',
      'Sharing everything supports the 10,000-game account limit.',
      'Games are shared in small batches that resume after interruptions.',
      'Large libraries may take over a day.',
      'whole-list results stay unknown until every page is loaded.',
      'When you share everything with friends, stopping online saving also ends sharing.',
      'Choose Share all with friends to restart it.',
      'If you share selected games, pausing online saving can retain the last shared copy until you stop sharing.',
      'Account exports exclude active invitation links and others',
      'Email, notes, Play later and play history stay excluded.',
      'Guest and online copies remain.',
      'Stopping online saving keeps copies but stops uploads.',
      'Deleting an online copy removes its profile and library and unpublishes its ranking, keeping device recovery data.',
      'Account deletion needs recent sign-in.',
      'If deletion is interrupted, the account stays.',
      'Some older shared copies need the site owner',
      "Small records with no library content remain so that old sessions can't bring deleted data back.",
      'never full URLs, queries, IP addresses, browser details or account IDs.',
      'without account credentials.',
      'never messages or stack traces.',
      'Counts use no device storage or visitor ID',
      'Reporting is limited to 20 errors and four send attempts per page.',
      'not visitor analytics.',
      'Requests exclude private titles, ratings, notes, progress and account IDs.',
      'External scores are neither combined nor treated as yours. Missing data is not zero.',
    ])
      expect(text).toContain(phrase);
  });

  it('gives practical next steps and identifies services in full sentences', () => {
    expect(text).toContain('Download a backup from Settings or Account.');
    expect(text).toContain('Vercel hosts the site. Firebase provides sign-in and online storage.');
    expect(text).toContain('Use Account to export or delete your data. For questions, use the creator links below.');
    expect(text).toContain(
      'online lookup uses the exact public game ID to request public ratings and licensed artwork.',
    );
  });
});
