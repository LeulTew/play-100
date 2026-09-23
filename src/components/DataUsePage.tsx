import { lazy, Suspense, useEffect } from 'react';
import { SiteFooter } from './SiteFooter';
import { createRetryableModule } from '../lib/retryable-module';
import { ChunkBoundary } from './ChunkBoundary';
import { ChunkRecovery } from './ChunkRecovery';

const DataUseContent = lazy(createRetryableModule(() => import('./DataUseContent')).load);

export default function DataUsePage() {
  useEffect(() => { document.title = 'Data use | Play 100'; }, []);
  return <>
    <a className="skip-link" href="#data-use">Skip to data use</a>
    <header className="site-header"><a className="wordmark" href="/">PLAY<span>100</span><i aria-hidden="true">.</i></a><a className="text-button" href="/account">Account</a></header>
    <main className="app-page data-use-page" id="data-use">
      <h1>Data use</h1>
      <p>Device storage, account saving and public sharing are separate choices. This page does not open your private library or start online saving.</p>
      {/* Keep the footer below the viewport while the long disclosure body loads. */}
      <ChunkBoundary fallback={<ChunkRecovery message="This page didn't load." />}><Suspense fallback={<p role="status" style={{ minHeight: '100vh' }}>Loading data-use details...</p>}>
        <DataUseContent />
      </Suspense></ChunkBoundary>
    </main>
    <SiteFooter />
  </>;
}
