import { Component } from 'react';
import type { ReactNode } from 'react';
import { ChunkRecovery } from './ChunkRecovery';
import { reportClientError } from '../lib/client-error-report';

interface OnlineBoundaryProps {
  children: ReactNode;
  onDevice: () => void;
  /** Told when the online tools fail, and when that failed boundary unmounts, so a new one starts over. */
  onFailedChange?: (failed: boolean) => void;
}

export class OnlineBoundary extends Component<OnlineBoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidMount() {
    // A boundary can fail as it mounts, and development's StrictMode then remounts it: report the failure again.
    if (this.state.failed) this.props.onFailedChange?.(true);
  }
  componentDidCatch(error: Error) {
    reportClientError(error, 'online');
    console.warn('Online tools could not load. The device library is retained.', error.message);
    this.props.onFailedChange?.(true);
  }
  componentWillUnmount() {
    if (this.state.failed) this.props.onFailedChange?.(false);
  }
  render() {
    if (this.state.failed)
      return (
        <section className="app-page data-error">
          <h2>Online tools couldn't open.</h2>
          <p>Your device library is still available.</p>
          <ChunkRecovery message="These online tools didn't load." />
          <button className="text-button" onClick={this.props.onDevice}>
            Keep using this device
          </button>
        </section>
      );
    return this.props.children;
  }
}
