import { Suspense } from 'react';
import type { ReactNode } from 'react';
import type { AppPage } from '../lib/types';
import { ChunkBoundary } from '../components/ChunkBoundary';
import { ChunkRecovery } from '../components/ChunkRecovery';
import { RouteFallback } from '../components/app/RouteFallback';

export function OnlinePageBoundary({
  scope,
  page,
  routeKey,
  children,
}: {
  scope: string;
  page: AppPage;
  routeKey: string;
  children: ReactNode;
}) {
  return (
    <ChunkBoundary
      key={`${scope}:${page}:${routeKey}`}
      fallback={
        <section className="app-page data-error">
          <ChunkRecovery message="This online page didn't load." />
        </section>
      }
    >
      <Suspense fallback={<RouteFallback route={page} kind="cloud-page" />}>{children}</Suspense>
    </ChunkBoundary>
  );
}
