import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportClientError } from '../../lib/client-error-report';
import { ChunkRecovery } from '../ChunkRecovery';

/**
 * Contains a routed page's render error to that page, so the header, navigation, dialogs and other pages keep working.
 * RouteHost keys it by route and scope, so opening another page starts over; the app-level ErrorBoundary remains the
 * last resort for the shell itself. Module load failures stay with the ChunkBoundary inside it.
 */
export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(
      'A page could not render. The rest of Play 100 is still available.',
      error instanceof Error ? error.message : 'Unknown render error.',
      info.componentStack,
    );
    reportClientError(error, 'route');
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="app-page data-error" aria-labelledby="route-error-title">
        <h1 id="route-error-title" data-page-heading tabIndex={-1}>
          This page ran into a problem.
        </h1>
        <p>Your saved data hasn't changed, and the rest of Play 100 still works.</p>
        <div className="button-row">
          <button type="button" className="button button-dark" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
        </div>
        <ChunkRecovery message="If it happens again, reload this page." />
      </section>
    );
  }
}
