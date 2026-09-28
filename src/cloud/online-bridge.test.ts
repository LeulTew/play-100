import { describe, expect, it } from 'vitest';
import type { LibraryController } from '../lib/library-controller';
import { SYNC_LABELS } from '../lib/cloud-types';
import type { AccountIdentity } from './ui-types';
import { onlineBridge } from './online-bridge';

const identity: AccountIdentity = {
  uid: 'alpha',
  email: 'alpha@example.test',
  displayName: 'Alpha',
  verified: true,
  providers: ['password'],
};
const controller = { busy: false } as LibraryController;
const headerIdentity = { uid: 'alpha', name: 'Alpha', avatarSrc: 'data:image/svg+xml,alpha' };
const base = {
  restoring: false,
  identity,
  signInOpen: false,
  controller,
  scope: 'account:demo-play100:alpha' as const,
  active: true,
  cacheUnavailable: false,
  syncEnabled: true,
  status: 'saved' as const,
  pendingEdits: false,
  creator: false,
  headerIdentity,
  friendSharing: null,
};

describe('the online bridge App reads', () => {
  it('edits and saves the connected account library, and names its sync status', () => {
    expect(onlineBridge(base)).toEqual({
      loading: false,
      identity,
      signInOpen: false,
      controller,
      scope: 'account:demo-play100:alpha',
      enabled: true,
      status: 'saved',
      label: SYNC_LABELS.saved,
      creator: false,
      headerIdentity,
      friendSharing: null,
    });
    expect(onlineBridge({ ...base, status: 'retrying' }).label).toBe(SYNC_LABELS.retrying);
  });

  it('says local edits are finishing before it names the sync status', () => {
    expect(onlineBridge({ ...base, pendingEdits: true })).toMatchObject({
      status: 'saved',
      label: 'Finishing local edits…',
    });
  });

  it('saves online only for a verified account whose online saving is on', () => {
    expect(onlineBridge({ ...base, identity: { ...identity, verified: false } }).enabled).toBe(false);
    expect(onlineBridge({ ...base, syncEnabled: false, status: 'paused' })).toMatchObject({
      enabled: false,
      scope: 'account:demo-play100:alpha',
      status: 'paused',
      label: SYNC_LABELS.paused,
    });
  });

  it('keeps the guest library, device only, until an account library opens', () => {
    expect(onlineBridge({ ...base, restoring: true, active: false, controller: null })).toMatchObject({
      loading: true,
      identity,
      controller: null,
      scope: 'guest',
      enabled: false,
      status: 'device',
      label: 'Device only',
    });
    expect(
      onlineBridge({ ...base, identity: null, scope: null, active: false, controller: null, headerIdentity: null }),
    ).toMatchObject({ identity: null, scope: 'guest', enabled: false, status: 'device', label: 'Device only' });
    expect(onlineBridge({ ...base, identity: undefined, scope: null, active: false }).identity).toBeNull();
  });

  it("keeps an unreadable account device copy's scope, so App never edits the guest library in its place", () => {
    expect(onlineBridge({ ...base, active: false, cacheUnavailable: true })).toMatchObject({
      scope: 'account:demo-play100:alpha',
      enabled: false,
      status: 'error',
      label: 'Device copy unavailable',
    });
  });
});
