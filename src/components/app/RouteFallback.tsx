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
  const line = <span className="discovery-skeleton-line" />;
  const content = form ? line : <><i className="discovery-card-art" /><h3>{line}</h3>{line}</>;
  const skeleton = <div className={`route-skeleton ${form ? 'route-form' : cards ? 'discovery-skeleton discovery-cards-grid' : 'discovery-skeleton discovery-cards-list'}`} aria-hidden="true" inert>
    {Array.from({ length: cards ? 10 : 3 }, (_, index) => <div className={form ? 'search-field' : 'discovery-card-skeleton'} key={index}>{content}</div>)}
  </div>;
  const status = <p className="section-help" role="status" aria-live="polite">{props.kind === 'account-sheet' ? 'Opening sign-in...' : props.kind === 'private-library' ? 'Waiting for the correct guest or account scope before allowing edits.' : `Loading ${title}...`}</p>;
  if (props.kind === 'account-sheet') return <Dialog open motion={false} titleId="loading-account-title" onClose={props.onClose} getReturnFocus={props.getReturnFocus} className="info-dialog">
    <h2 id="loading-account-title" data-autofocus tabIndex={-1}>Sign in</h2>
    {status}{skeleton}
  </Dialog>;
  return <section className="app-page route-fallback" data-route={props.route} aria-label={title} aria-busy="true">
    <div className={cards ? 'discovery-heading' : 'page-heading'}><h1>{title}</h1></div>
    {status}{skeleton}
  </section>;
}
