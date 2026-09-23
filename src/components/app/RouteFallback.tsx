import type { ComponentProps } from 'react';
import type { AppPage } from '../../lib/types';
import { Dialog } from '../Dialog';

export type RouteFallbackProps = { route: AppPage } & (
  | { kind: 'public-page' | 'cloud-page' | 'private-library' }
  | { kind: 'account-sheet'; onClose: () => void; getReturnFocus: ComponentProps<typeof Dialog>['getReturnFocus'] }
);

export function RouteFallback(props: RouteFallbackProps) {
  switch (props.kind) {
    case 'cloud-page':
      return <div className="page-loading" role="status"><h1>Loading...</h1></div>;
    case 'private-library':
      return <div className="page-loading" role="status"><h2>Opening your saved library...</h2><p>Waiting for the correct guest or account scope before allowing edits.</p></div>;
    case 'account-sheet':
      return <Dialog open motion={false} titleId="loading-account-title" onClose={props.onClose} getReturnFocus={props.getReturnFocus} className="info-dialog"><h2 id="loading-account-title" data-autofocus tabIndex={-1}>Opening sign-in...</h2></Dialog>;
    case 'public-page':
      return <div className="page-loading" role="status"><h2>Opening your page...</h2><p>Your games stay right where you left them.</p></div>;
  }
}
