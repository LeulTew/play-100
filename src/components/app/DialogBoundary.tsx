import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportClientError } from '../../lib/client-error-report';
import { focusPendingEditor, visibleFocusTarget, visibleMenuTrigger } from '../../lib/dialog-focus';
import { foregroundDialog } from '../dialog-layer';

interface DialogBoundaryProps {
  children: ReactNode;
  onClose: () => void;
  onFailure: () => void;
  getReturnFocus?: () => HTMLElement | null;
}

export class DialogBoundary extends Component<DialogBoundaryProps, { failed: boolean }> {
  state = { failed: false };
  private opener: HTMLElement | null = null;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidMount() {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportClientError(error, 'route');
    console.error(
      'A dialog could not render. The rest of Play 100 is still available.',
      error instanceof Error ? error.message : 'Unknown render error.',
      info.componentStack,
    );
    const preferred = this.props.getReturnFocus?.() ?? this.opener;
    this.props.onFailure();
    this.props.onClose();
    queueMicrotask(() => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body && visibleFocusTarget(focused)) return;
      const foreground = foregroundDialog();
      const allowed = (target: HTMLElement | null) =>
        target !== document.body && visibleFocusTarget(target) && (!foreground || foreground.contains(target));
      const target = allowed(preferred)
        ? preferred
        : foreground
          ? (foreground.querySelector<HTMLElement>('[data-autofocus]') ?? foreground)
          : ([
              ...document.querySelectorAll<HTMLElement>(
                '[data-page-heading][tabindex], #collection-title[tabindex], main h1[tabindex]',
              ),
            ].find(allowed) ?? visibleMenuTrigger());
      focusPendingEditor(target);
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
