import { Component } from 'react';
import type { ReactNode } from 'react';
import { isModuleLoadFailure } from '../lib/chunk-recovery';

export class ChunkBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: Error) {
    if (isModuleLoadFailure(error)) console.error('An app module did not load.', error);
  }
  render() {
    if (this.state.error) {
      if (!isModuleLoadFailure(this.state.error)) throw this.state.error;
      return this.props.fallback;
    }
    return this.props.children;
  }
}
