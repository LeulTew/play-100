import { createHash } from 'node:crypto';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPage } from './AccountPage';
import type { AccountPageProps } from './AccountPage';
import type { ScopedLibrary, SyncHead } from '../lib/cloud-types';
import { emptyPersonalLibrary } from '../lib/personal-library';

vi.mock('./account-deletion-action', () => ({ createAccountDeletion: () => vi.fn(async () => true) }));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState) };
});
afterEach(() => vi.mocked(useState).mockReset());

const cache: ScopedLibrary = {
  version: 1,
  scope: 'account:demo-play100:fixture',
  state: emptyPersonalLibrary(),
  recovery: null,
  profile: null,
  sync: {
    enabled: false,
    epoch: 0,
    baseRemoteRevision: 0,
    remoteGeneration: null,
    dirty: false,
    dataRevision: 0,
    displayName: '',
    lastSyncedAt: null,
  },
};
const head: SyncHead = {
  format: 1,
  enabled: true,
  deleted: false,
  epoch: 1,
  revision: 1,
  current: { format: 1, generation: 'a'.repeat(36), digest: 'a'.repeat(64), chunks: ['one'], bytes: 10 },
  previous: null,
  updatedAt: 0,
};
function props(overrides: Partial<AccountPageProps> = {}): AccountPageProps {
  const identity = {
    uid: 'fixture',
    email: 'fixture@play100.test',
    displayName: 'Fixture player',
    verified: true,
    providers: ['password'],
  };
  return {
    identity,
    member: null,
    cache,
    guest: emptyPersonalLibrary(),
    head: null,
    remoteReady: true,
    status: 'device',
    error: '',
    message: '',
    cleanupWarning: '',
    busy: false,
    resendIn: 0,
    isCreator: false,
    avatar: createElement('span', null, 'Fixture icon'),
    onAvatar: vi.fn(),
    onName: vi.fn(async () => true),
    onConnect: vi.fn(async () => true),
    onVerify: vi.fn(async () => true),
    onRefreshIdentity: vi.fn(async () => true),
    onSignOut: vi.fn(async () => true),
    onLinkGoogle: vi.fn(async () => true),
    onRetry: vi.fn(async () => true),
    onCleanup: vi.fn(async () => true),
    onPause: vi.fn(async () => true),
    onDownload: vi.fn(async () => true),
    onUseRemote: vi.fn(async () => true),
    onUseLocal: vi.fn(async () => true),
    onSignOutAndRemove: vi.fn(async () => true),
    googleDeletion: null,
    onDismissDeletion: vi.fn(),
    onPublish: vi.fn(),
    onCommunity: vi.fn(),
    onCreator: vi.fn(),
    deletion: {
      identity,
      identityRef: { current: identity },
      scope: cache.scope,
      currentEpoch: { current: 0 },
      authSessionEpochRef: { current: 0 },
      state: { approval: null, setApproval: vi.fn(), notice: null, setNotice: vi.fn(), probe: { current: null } },
      account: { snapshot: cache, waitForWrites: vi.fn(async () => {}), refresh: vi.fn(async () => {}) },
      sync: { store: null, suspend: vi.fn() },
      friends: {
        store: { revokeForDeletion: vi.fn(), saveSettings: vi.fn(), cleanupSharing: vi.fn(), cleanupDeleted: vi.fn() },
        stop: vi.fn(),
        acceptSettings: vi.fn(),
      },
      shelf: {
        store: { revokeForDeletion: vi.fn(), saveConfig: vi.fn(), cleanupSharing: vi.fn(), cleanupDeleted: vi.fn() },
        stop: vi.fn(),
        acceptConfig: vi.fn(),
      },
      automatic: {
        store: {
          revokeForDeletion: vi.fn(),
          controls: vi.fn(),
          setPolicy: vi.fn(),
          policy: vi.fn(),
          cleanupPage: vi.fn(),
        },
        suspend: vi.fn(),
      },
      social: { unpublish: vi.fn(), control: vi.fn(), deleteProfile: vi.fn() },
      run: vi.fn(),
      reconcileIdentity: vi.fn(),
      setIdentity: vi.fn(),
      setHeadSnapshot: vi.fn(),
      setError: vi.fn(),
      setMessage: vi.fn(),
      refresh: vi.fn(),
      onCloseSheet: vi.fn(),
      onNavigate: vi.fn(),
    },
    ...overrides,
  };
}

function fingerprint(value: AccountPageProps) {
  // Whole-DOM contract from 7c118f54, refreshed only for the visible Data use external-link indicator.
  const html = renderToStaticMarkup(createElement(AccountPage, value));
  expect(html).toContain('class="app-page account-page" aria-labelledby="account-title"');
  return createHash('sha256').update(html).digest('hex');
}

describe('Account page markup contract', () => {
  it.each([
    ['empty verified account', {}],
    ['unverified account', { identity: { ...props().identity, verified: false }, resendIn: 30 }],
    ['pending verification', { identity: { ...props().identity, verificationPending: true } }],
    ['checking remote copies', { remoteReady: false }],
    ['online replacement choices', { head }],
    ['busy connection', { head, busy: true }],
    ['missing device cache', { cache: null, error: 'Device copy unavailable' }],
    ['active sync', { cache: { ...cache, sync: { ...cache.sync, enabled: true } }, status: 'saved' }],
    [
      'sync conflict',
      { cache: { ...cache, sync: { ...cache.sync, enabled: true } }, head, status: 'conflict', error: 'Choose a copy' },
    ],
    ['cleanup warning', { cleanupWarning: 'Cleanup needs a retry', message: 'Saved' }],
    ['cancelled registration', { cancelledRegistration: true }],
    ['complete deletion', { head: { ...head, deleted: true }, deletionState: 'complete' }],
    ['incomplete deletion', { head: { ...head, deleted: true }, deletionState: 'incomplete' }],
    ['checking deletion', { head: { ...head, deleted: true }, deletionState: 'checking' }],
    [
      'sharing and creator tools',
      {
        isCreator: true,
        onFriends: vi.fn(),
        onCompare: vi.fn(),
        friendsSharing: createElement('p', null, 'Friends fixture'),
        sharedGames: createElement('p', null, 'Games fixture'),
      },
    ],
  ] satisfies [string, Partial<AccountPageProps>][])('%s keeps its complete DOM', (_, patch) => {
    expect(fingerprint(props(patch))).toMatchSnapshot();
  });

  it.each(['pause', 'remote', 'local', 'delete-copy', 'delete-account', 'signout-device'])(
    '%s confirmation keeps its text, fields and native dialog controls',
    (confirmation) => {
      for (const state of [
        'Fixture player',
        false,
        '',
        null,
        confirmation,
        'example-password',
        { head, localRevision: 3 },
      ])
        vi.mocked(useState).mockReturnValueOnce([state, vi.fn()]);
      expect(fingerprint(props({ head }))).toMatchSnapshot();
    },
  );

  it.each([false, true])('keeps Google deletion continuation markup with confirmed=%s', (confirmed) => {
    for (const state of ['Fixture player', false, '', null, 'delete-account', '', null])
      vi.mocked(useState).mockReturnValueOnce([state, vi.fn()]);
    expect(
      fingerprint(
        props({
          identity: { ...props().identity, providers: ['google.com'] },
          googleDeletion: confirmed ? { requestId: 'fixture', target: 'account' } : null,
        }),
      ),
    ).toMatchSnapshot();
  });
});
