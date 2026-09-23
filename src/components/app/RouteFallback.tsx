import type { ComponentProps } from 'react';
import type { AppPage } from '../../lib/types';
import { Dialog } from '../Dialog';
import './route-fallback.css';

export type RouteFallbackProps = { route: AppPage } & (
  | { kind: 'public-page' | 'cloud-page' | 'private-library' }
  | { kind: 'account-sheet'; onClose: () => void; getReturnFocus: ComponentProps<typeof Dialog>['getReturnFocus'] }
);

const titles: Record<AppPage, string> = {
  collection: 'The 100', games: 'My games', library: 'My games', rankings: 'My games', discover: 'Discover',
  account: 'Account', publish: 'Publish ranking', community: 'Community', profile: 'Public ranking',
  creator: 'Creator desk', friends: 'Friends', friend: 'Player', invite: 'Invitation', compare: 'Compare rankings',
  'friend-sharing': 'Friends sharing', 'friend-shelf': 'Shared games',
};

export function RouteFallback(props: RouteFallbackProps) {
  const title = titles[props.route];
  const cards = props.kind !== 'account-sheet' && props.route === 'discover';
  const form = props.kind === 'account-sheet' || props.route === 'account' || props.route === 'publish';
  const skeleton = <div className={`route-skeleton ${cards ? 'route-cards' : form ? 'route-form' : ''}`} aria-hidden="true" inert>
    {Array.from({ length: cards ? 10 : 3 }, (_, index) => <div key={index}><i /><span /><span /></div>)}
  </div>;
  if (props.kind === 'account-sheet') return <Dialog open motion={false} titleId="loading-account-title" onClose={props.onClose} getReturnFocus={props.getReturnFocus} className="info-dialog">
    <h2 id="loading-account-title" data-autofocus tabIndex={-1}>Sign in</h2>
    <p role="status" aria-live="polite">Opening sign-in...</p>{skeleton}
  </Dialog>;
  return <section className="app-page route-fallback" data-route={props.route} aria-label={title} aria-busy="true">
    <div className="page-heading"><h1>{title}</h1><span className={`${cards ? 'text-button' : 'button'} route-fallback-action`} aria-hidden="true" /></div>
    <p role="status" aria-live="polite">{props.kind === 'private-library' ? 'Waiting for the correct guest or account scope before allowing edits.' : `Loading ${title}...`}</p>
    {skeleton}
  </section>;
}
