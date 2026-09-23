import type { ComponentProps } from 'react';
import { SettingsDialog } from '../SettingsDialog';
import PwaControls from '../PwaControls';

export interface SettingsPanelProps {
  settings: ComponentProps<typeof SettingsDialog>;
  offline?: ComponentProps<typeof PwaControls>;
}

export function SettingsPanel({ settings, offline }: SettingsPanelProps) {
  return <SettingsDialog {...settings} offlineControls={offline ? <PwaControls {...offline} /> : undefined} />;
}
