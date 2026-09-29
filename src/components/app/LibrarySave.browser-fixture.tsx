import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PersonalRatingInput } from '../personal/PersonalRatingInput.tsx';
import { useLibrarySave } from '../../hooks/useLibrarySave.ts';
import type { LibraryRecord, PersonalAction } from '../../lib/personal-types.ts';

const saves: string[] = [];
const record = { id: 'hades', title: 'Hades' } as LibraryRecord;
let restoreAccount = () => {};
let accountOpened = () => {};
// Mirrors App: the save is bound to the library shown, and another tab restoring an account first marks the library as
// opening, then switches it, and the rating field leaves with the guest page.
export function App() {
  const [scope, setScope] = useState('guest');
  const [opening, setOpening] = useState(false);
  const [open, setOpen] = useState(true);
  const activeScope = useRef(scope);
  useEffect(() => {
    activeScope.current = scope;
    restoreAccount = () => setOpening(true);
    accountOpened = () => {
      setScope('account');
      setOpening(false);
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
  const perform = useLibrarySave({ library, opening, notify() {}, activeScope, scope });
  return h(
    'div',
    null,
    h('span', { id: 'scope' }, `${scope}${opening ? ' opening' : ''}`),
    open &&
      h(PersonalRatingInput, {
        title: 'Hades',
        value: 5,
        busy: false,
        onCommit: (score) => perform({ type: 'rate-game', record, score }),
      }),
  );
}
const mount = document.getElementById('mount');
if (!mount) throw new Error('The library save fixture has no #mount element.');
window.librarySaveFixture = { saves, restoreAccount: () => restoreAccount(), accountOpened: () => accountOpened() };
createRoot(mount).render(h(App));
