import { useState } from 'react';
import type { LibraryRecord, PersonalLibraryState } from '../../lib/personal-types';
import { Dialog } from '../Dialog';
import { Icon } from '../Icon';
import { useLibraryMode } from '../../lib/library-mode';

export function RemoveGamesDialog({ records, state, busy, onClose, onRemove }: {
  records: LibraryRecord[]; state: PersonalLibraryState; busy: boolean;
  onClose: () => void; onRemove: (ids: string[]) => Promise<boolean>;
}) {
  const mode = useLibraryMode();
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);
  const remaining = records.filter((record) => state.records[record.id]);
  const title = remaining.length === 1 ? 'Remove this game?' : `Remove ${remaining.length} games?`;
  const submit = async () => {
    if (removing || busy || !remaining.length) return;
    setRemoving(true);
    setFailed(false);
    try {
      if (await onRemove(remaining.map((record) => record.id))) onClose();
      else setFailed(true);
    } finally { setRemoving(false); }
  };
  return (
    <Dialog open titleId="remove-games-title" descriptionId="remove-games-description" onClose={() => { if (!removing) onClose(); }} className="info-dialog">
      <h2 id="remove-games-title">{remaining.length ? title : 'Already removed.'}</h2>
      <p id="remove-games-description">{remaining.length ? 'This deletes their saved entries, queue positions, played/completed marks, personal ratings and notes from this browser. The original 100 and its ratings never change.' : 'These games are no longer in your private library. No other games will be removed.'}</p>
      {mode.scope !== 'guest' && <p className="section-help">This account-library removal will sync while online saving is enabled. Any separately published snapshot stays unchanged until you update or unpublish it.</p>}
      {remaining.length > 0 && <>
        <ul className="removal-games">{remaining.slice(0, 6).map((record) => <li key={record.id}>{record.title}</li>)}{remaining.length > 6 && <li>And {remaining.length - 6} more selected games</li>}</ul>
        <p className="removal-warning">This cannot be undone. To keep a copy, cancel and export a backup from Settings first.</p>
      </>}
      {failed && <p className="inline-error" role="alert">Nothing was removed. Your saved data is unchanged. Check the storage warning and try again.</p>}
      <div className="button-row"><button className="button button-outline" data-autofocus disabled={removing} onClick={onClose}>{remaining.length ? 'Keep games' : 'Close'}</button>{remaining.length > 0 && <button className="button button-danger" disabled={busy || removing} onClick={() => { void submit(); }}><Icon name="trash" width="18" height="18" />{removing ? 'Removing...' : `Remove ${remaining.length} ${remaining.length === 1 ? 'game' : 'games'}`}</button>}</div>
    </Dialog>
  );
}
