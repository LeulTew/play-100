import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Play 100 could not render the collection.', error.message, info.componentStack);
  }
  render() {
    if (this.state.failed) {
      return (
        <main className="app-error">
          <h1>Let's get you back to the games.</h1>
          <p>The page ran into a problem. Your saved device data has not been cleared.</p>
          <button className="button button-dark" onClick={() => window.location.reload()}>
            Reload the collection
          </button>
          <a href="/downloads/Play-100-Collection.xlsx" download>
            Or download the workbook
          </a>
        </main>
      );
    }
    return this.props.children;
  }
}
