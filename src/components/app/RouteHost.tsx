import { lazy, memo, Suspense } from 'react';
import type { ComponentProps } from 'react';
import type { AppPage } from '../../lib/types';
import CollectionPage from '../CollectionPage';
import { OnlineBoundary } from '../OnlineBoundary';
import { RouteFallback } from './RouteFallback';
import type { RouteFallbackProps } from './RouteFallback';
import { createMemoizedModule } from '../../lib/memoized-module';
import { ChunkBoundary } from '../ChunkBoundary';
import { ChunkRecovery } from '../ChunkRecovery';
import { routeBoundaryKey } from './route-boundary';
import { RouteBoundary } from './RouteBoundary';
import { OnlineRoute } from './OnlineRoute';
import type { OnlineControllerProps } from './OnlineRoute';

const MyGamesPage = lazy(createMemoizedModule(() => import('../personal/MyGamesPage')).load);
const DiscoverPage = lazy(createMemoizedModule(() => import('../catalog/DiscoverPage')).load);

type PublicContent =
  | { kind: 'private-library' }
  | { kind: 'personal'; props: ComponentProps<typeof MyGamesPage> }
  | { kind: 'discover'; props: ComponentProps<typeof DiscoverPage> }
  | { kind: 'collection'; props: ComponentProps<typeof CollectionPage> };

export interface RouteHostProps {
  route: AppPage;
  scope: string;
  online: {
    props: OnlineControllerProps;
    fallback: RouteFallbackProps | null;
    onDevice: () => void;
    onFailedChange: (failed: boolean) => void;
  } | null;
  content: PublicContent | { kind: 'unconfigured' } | null;
}

function publicContent(content: PublicContent, route: AppPage) {
  switch (content.kind) {
    case 'private-library':
      return <RouteFallback route={route} kind="private-library" />;
    case 'personal':
      return <MyGamesPage {...content.props} />;
    case 'discover':
      return <DiscoverPage {...content.props} />;
    case 'collection':
      return <CollectionPage {...content.props} />;
  }
}

/** Memoised: App re-renders for dialogs, the tray and notices, and AppRoute keeps these props stable across them. */
export const RouteHost = memo(function RouteHost({ route, scope, online, content }: RouteHostProps) {
  // The private placeholder is not page content: the lazy page that replaces it mounts a new Suspense
  // boundary, which shows its fallback even when a transition (the opened library) brings the page in.
  const boundary = content?.kind === 'private-library' ? 'private' : 'page';
  return (
    <>
      {online && (
        <OnlineBoundary onDevice={online.onDevice} onFailedChange={online.onFailedChange}>
          <Suspense fallback={online.fallback ? <RouteFallback {...online.fallback} /> : null}>
            <OnlineRoute {...online.props} />
          </Suspense>
        </OnlineBoundary>
      )}
      {content?.kind === 'unconfigured' ? (
        <section className="app-page empty-state">
          <h1>Online tools are not configured in this build.</h1>
          <p>Your device library and the original collection remain available.</p>
          <a className="button button-dark" href="/">
            Open the collection
          </a>
        </section>
      ) : (
        content && (
          // A page's render error stays inside the page; its failed module load stays with the ChunkBoundary.
          <RouteBoundary key={routeBoundaryKey(route, content.kind, scope)}>
            <ChunkBoundary
              fallback={
                <section className="app-page data-error">
                  <ChunkRecovery message="This page didn't load." />
                </section>
              }
            >
              <Suspense key={boundary} fallback={<RouteFallback route={route} kind="public-page" />}>
                <div key={scope}>{publicContent(content, route)}</div>
              </Suspense>
            </ChunkBoundary>
          </RouteBoundary>
        )
      )}
    </>
  );
});
