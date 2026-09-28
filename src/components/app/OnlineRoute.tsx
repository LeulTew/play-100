import { lazy, useSyncExternalStore } from 'react';
import type { ComponentProps } from 'react';
import { createMemoizedModule } from '../../lib/memoized-module';

const OnlineController = lazy(createMemoizedModule(() => import('../../cloud/OnlineController')).load);

export type OnlineControllerProps = ComponentProps<typeof OnlineController>;

function subscribeUrl(changed: () => void) {
  window.addEventListener('popstate', changed);
  window.addEventListener('play100:navigate', changed);
  return () => {
    window.removeEventListener('popstate', changed);
    window.removeEventListener('play100:navigate', changed);
  };
}
const currentUrl = () => window.location.href;
const serverUrl = () => '';

/**
 * The online controller, rendered again on every navigation. It reads the URL during render (the compare group, the
 * friend page), and RouteHost's memo would otherwise keep a page on the URL it opened with while its props hold.
 */
export function OnlineRoute(props: OnlineControllerProps) {
  useSyncExternalStore(subscribeUrl, currentUrl, serverUrl);
  return <OnlineController {...props} />;
}
