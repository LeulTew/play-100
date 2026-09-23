import type { ComponentProps } from 'react';
import type { AppPage } from '../../lib/types';
import { CompareTray } from '../compare-tray';

export interface TrayHostProps {
  page: AppPage;
  tray: ComponentProps<typeof CompareTray>;
}

export function TrayHost({ tray }: TrayHostProps) {
  return <CompareTray {...tray} />;
}
