import { useEffect, useState } from 'react';
import type { LibraryScope } from '../lib/cloud-types';
import { clearComparisonGameFilter, COMPARISON_GAMES_EVENT, readComparisonGameFilter } from '../lib/comparison-game-filter';

export function useComparisonGameFilter(scope: LibraryScope) {
  const [saved, setSaved] = useState(() => ({ scope, ...readComparisonGameFilter(scope) }));
  useEffect(() => {
    const update = () => setSaved({ scope, ...readComparisonGameFilter(scope) });
    update();
    window.addEventListener('popstate', update); window.addEventListener(COMPARISON_GAMES_EVENT, update);
    return () => { window.removeEventListener('popstate', update); window.removeEventListener(COMPARISON_GAMES_EVENT, update); };
  }, [scope]);
  return {
    value: saved.scope === scope ? saved.value : null, warning: saved.scope === scope ? saved.warning : null,
    clear: () => { const warning = clearComparisonGameFilter(scope); setSaved({ scope, value: null, warning }); },
  };
}
