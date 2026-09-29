import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CatalogDetail from '../personal/CatalogDetail.tsx';
import { useDetailSelection } from '../../hooks/useDetailSelection.ts';
import { useBoundHandlers } from '../../hooks/useLatest.ts';
import { useLibrarySave } from '../../hooks/useLibrarySave.ts';
import type { LibraryRecord, PersonalAction } from '../../lib/personal-types.ts';

const saves: string[] = [];
const record: LibraryRecord = {
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
const noRecords: LibraryRecord[] = [];
let signOutElsewhere = () => {};
// Mirrors App: the detail dialog's save goes through useDetailSelection and App's bound library commands. Another tab
// signs out, so this tab switches to the guest library and the account's detail dialog closes.
export function App() {
  const [scope, setScope] = useState('account:a');
  const [open, setOpen] = useState(true);
  const activeScope = useRef(scope);
  useEffect(() => {
    activeScope.current = scope;
    signOutElsewhere = () => {
      setScope('guest');
      setOpen(false);
    };
  }, [scope]);
  const library = useMemo(
    () => ({
      status: 'ready' as const,
      perform: (action: PersonalAction) => {
        saves.push(`${scope}:${action.type === 'rate-game' ? String(action.score) : action.type}`);
        return Promise.resolve(true);
      },
    }),
    [scope],
  );
  const records = useMemo(() => (scope === 'guest' ? {} : { [record.id]: record }), [scope]);
  const perform = useLibrarySave({ library, opening: false, notify() {}, activeScope, scope });
  const detail = useDetailSelection({
    selectedSlug: open ? record.id : null,
    page: 'games',
    libraryScope: scope,
    games: [],
    collectionReady: true,
    records,
    canonicalRecords: noRecords,
    closeGame: () => setOpen(false),
    notify() {},
    clearNotice() {},
    perform,
  });
  const commands = useBoundHandlers(perform, { performDetailAction: detail.performDetailAction });
  return h(
    'div',
    null,
    h('span', { id: 'scope' }, scope),
    open &&
      h(CatalogDetail, {
        record,
        saved: true,
        progress: undefined,
        rankingPosition: null,
        rating: 5,
        busy: false,
        onClose: () => setOpen(false),
        onAction: commands.performDetailAction,
        onRankings() {},
      }),
  );
}
const mount = document.getElementById('mount');
if (!mount) throw new Error('The detail save fixture has no #mount element.');
window.detailSaveFixture = { saves, signOutElsewhere: () => signOutElsewhere() };
createRoot(mount).render(h(App));
