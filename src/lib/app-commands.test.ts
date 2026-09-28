import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPendingEditor } from '../hooks/useExitSave';
import type { AccountIdentity } from '../cloud/ui-types';
import { enableOnlineDetails, enterAccount, startComparison } from './app-commands';
import type { ComparisonContext } from './app-commands';

const location = { pathname: '/', search: '?game=hades' };
const replaceState = vi.fn((_state: unknown, _title: string, url: string) => {
  const [pathname, search = ''] = url.split('?');
  location.pathname = pathname ?? '/';
  location.search = search ? `?${search}` : '';
});
const dispatchEvent = vi.fn();
const cleanups: (() => Promise<boolean>)[] = [];

function blockingEditor(flush: () => Promise<boolean>) {
  const state = { pending: true };
  const unregister = registerPendingEditor({ pending: () => state.pending, flush });
  cleanups.push(() => {
    state.pending = false;
    return unregister();
  });
}

beforeEach(() => {
  location.pathname = '/discover';
  location.search = '?game=hades';
  vi.stubGlobal('window', { location, history: { state: null, replaceState }, dispatchEvent });
});
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const context = (current = () => true) => ({ captureFocusGuard: () => current, notify: vi.fn() });

describe('enterAccount', () => {
  it('opens the account once the open edits save', async () => {
    const open = vi.fn();
    await enterAccount({ ...context(), open }, 'compare');
    expect(open).toHaveBeenCalledWith('compare', expect.any(Function));
    expect(open.mock.calls[0]?.[1]()).toBe(true);
  });

  it('keeps the page and names the open edit when it cannot save', async () => {
    blockingEditor(async () => false);
    const open = vi.fn();
    const commands = { ...context(), open };
    await enterAccount(commands, 'account');
    expect(open).not.toHaveBeenCalled();
    expect(commands.notify).toHaveBeenCalledWith('Finish or correct the open rating or note before changing accounts.');
  });

  it('opens nothing once the view it started in changed', async () => {
    let finish: (saved: boolean) => void = () => {};
    blockingEditor(() => new Promise((resolve) => (finish = resolve)));
    const open = vi.fn();
    const commands = { ...context(), open };
    const entering = enterAccount(commands, 'account');
    location.search = '';
    finish(true);
    await entering;
    expect(open).not.toHaveBeenCalled();
    expect(commands.notify).not.toHaveBeenCalled();
  });
});

describe('startComparison', () => {
  const verified = { uid: 'u1', verified: true } as AccountIdentity;
  const comparison = (patch: Partial<ComparisonContext>): ComparisonContext => ({
    ...context(),
    opening: false,
    identity: verified,
    currentIdentity: () => verified,
    libraryScope: 'account:demo-play100:u1',
    page: 'collection',
    captureIntent: (current) => current,
    recover: vi.fn(),
    clearRecovery: vi.fn(),
    signIn: vi.fn(async () => {}),
    navigate: vi.fn(),
    toolFailure: vi.fn(),
    ...patch,
  });

  it('waits for an opening account', async () => {
    const commands = comparison({ opening: true });
    await startComparison(commands, []);
    expect(commands.notify).toHaveBeenCalledWith('Wait for your account to finish opening before comparing.');
    expect(commands.signIn).not.toHaveBeenCalled();
  });

  it('asks a guest to sign in first', async () => {
    const commands = comparison({ identity: null, libraryScope: 'guest' });
    await startComparison(commands, []);
    expect(commands.signIn).toHaveBeenCalledTimes(1);
    expect(commands.navigate).not.toHaveBeenCalled();
  });

  it('opens Account for an unverified account', async () => {
    const commands = comparison({ identity: { uid: 'u1', verified: false } as AccountIdentity });
    await startComparison(commands, []);
    expect(commands.notify).toHaveBeenCalledWith('Verify your account before comparing with friends.');
    expect(commands.navigate).toHaveBeenCalledWith('account');
  });
});

describe('enableOnlineDetails', () => {
  it('turns on online lookup in place once the open edit saves', async () => {
    const commands = context();
    await enableOnlineDetails(commands);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(location.search).toContain('catalogs=on');
    expect(location.search).toContain('game=hades');
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'play100:navigate' }));
    expect(commands.notify).not.toHaveBeenCalled();
  });

  it('changes nothing while the open edit is invalid', async () => {
    blockingEditor(async () => false);
    const commands = context();
    await enableOnlineDetails(commands);
    expect(commands.notify).toHaveBeenCalledWith('Correct the open edit before changing online lookup.');
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('changes nothing once the scope or navigation changed', async () => {
    let current = true;
    let finish: (saved: boolean) => void = () => {};
    blockingEditor(() => new Promise((resolve) => (finish = resolve)));
    const commands = context(() => current);
    const enabling = enableOnlineDetails(commands);
    current = false;
    finish(true);
    await enabling;
    expect(replaceState).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
