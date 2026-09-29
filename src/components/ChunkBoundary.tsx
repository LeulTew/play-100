import { Component } from 'react';
import type { ReactNode } from 'react';
import { isModuleLoadFailure } from '../lib/chunk-recovery';
import { reportClientError } from '../lib/client-error-report';

interface ChunkState {
  failed: boolean;
  error: unknown;
}

export class ChunkBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, ChunkState> {
  state: ChunkState = { failed: false, error: null };
  static getDerivedStateFromError(error: unknown): ChunkState {
    return { failed: true, error };
  }
  componentDidCatch(error: Error) {
    if (isModuleLoadFailure(error)) {
      reportClientError(error, 'chunk');
      console.error('An app module did not load.', error);
    }
  }
  render() {
    // A flag, not the thrown value's truthiness: whatever was thrown, even a falsy value, is rethrown as it was.
    if (this.state.failed) {
      if (!isModuleLoadFailure(this.state.error)) throw this.state.error;
      return this.props.fallback;
    }
    return this.props.children;
  }
}
