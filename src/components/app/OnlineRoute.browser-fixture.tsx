import { createElement as h, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouteHost } from './RouteHost.tsx';
import type { RouteHostProps } from './RouteHost.tsx';

const renders: string[] = [];
let bump = () => {};
// Mirrors App: stable online props, and other state (a notice, a panel, the tray) that changes around the route.
export function App() {
  const [other, setOther] = useState(0);
  useEffect(() => {
    bump = () => setOther((count) => count + 1);
  }, []);
  const online = useMemo<RouteHostProps['online']>(
    () => ({
      onDevice() {},
      onFailedChange() {},
      fallback: null,
      // The stubbed controller reads no props.
      props: {} as NonNullable<RouteHostProps['online']>['props'],
    }),
    [],
  );
  return h(
    'div',
    null,
    h('span', { id: 'other' }, String(other)),
    h(RouteHost, { route: 'compare', scope: 'guest', online, content: null }),
  );
}
const mount = document.getElementById('mount');
if (!mount) throw new Error('The online route fixture has no #mount element.');
window.onlineRouteFixture = { renders, bump: () => bump() };
createRoot(mount).render(h(App));
