import { useEffect, useState } from 'react';
import type { OnlineControllerProps } from './OnlineRoute';
import type { OnlineBridge } from '../../cloud/ui-types';
import type { LibraryController } from '../../lib/library-controller';
import type { LibraryRecord, PersonalAction } from '../../lib/personal-types';

const heldRecord: LibraryRecord = {
  id: 'manual:held',
  title: 'Held draft',
  year: null,
  studio: null,
  genre: null,
  source: 'manual',
  sourceId: 'held',
  sourceUrl: null,
  collectionRank: null,
};

function label(action: PersonalAction) {
  return action.type === 'rate-game' ? `${action.record.id}:${String(action.score)}` : action.type;
}

const account: LibraryController = {
  state: {
    version: 3,
    revision: 1,
    records: { [heldRecord.id]: heldRecord },
    progress: {},
    queueOrder: [],
    ranking: [{ id: heldRecord.id, score: 5, note: '', manualPosition: null }],
    motion: 'auto',
  },
  status: 'ready',
  warning: null,
  error: null,
  busy: false,
  perform: (action) => {
    window.appDetailSave.accountSaves.push(label(action));
    return Promise.resolve(true);
  },
  restore: () => Promise.resolve(true),
  reset: () => Promise.resolve(true),
};

const signedIn: OnlineBridge = {
  loading: false,
  identity: { uid: 'a', email: 'a@example.test', displayName: 'Account A', verified: true, providers: ['password'] },
  controller: account,
  scope: 'account:demo-play100:a',
  enabled: true,
  status: 'saved',
  label: 'Saved to your account',
  creator: false,
  headerIdentity: null,
};
const signedOut: OnlineBridge = {
  loading: false,
  identity: null,
  controller: null,
  scope: 'guest',
  enabled: true,
  status: 'device',
  label: 'Device only',
  creator: false,
  headerIdentity: null,
};

/**
 * Stands in for cloud/OnlineController in the real App: it reports account a with one ranked game, and "another tab"
 * signs out, so the bridge reports the guest again, as the real controller does after a cross-tab sign-out.
 */
export default function OnlineController({ onBridge }: OnlineControllerProps) {
  const [session, setSession] = useState(true);
  useEffect(() => {
    window.appDetailSave.signOutElsewhere = () => setSession(false);
  }, []);
  useEffect(() => onBridge(session ? signedIn : signedOut), [onBridge, session]);
  return null;
}
