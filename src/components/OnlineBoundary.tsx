import { Component } from 'react';
import type { ReactNode } from 'react';
import { ChunkRecovery } from './ChunkRecovery';

export class OnlineBoundary extends Component<{ children: ReactNode; onDevice: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn('Online tools could not load. The device library is retained.', error.message);
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
