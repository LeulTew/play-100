import type { ComponentProps } from 'react';
import { SettingsDialog } from '../SettingsDialog';
import PwaControls from '../PwaControls';

export interface SettingsPanelProps {
  settings: ComponentProps<typeof SettingsDialog>;
  offline?: ComponentProps<typeof PwaControls>;
}

export function SettingsPanel({ settings, offline }: SettingsPanelProps) {
  const controls = offline ? {
    ...offline,
    pwa: {
      ...offline.pwa,
      online: offline.pwa.online && (offline.pwa.controlsReady !== false || Boolean(offline.pwa.error) && !offline.pwa.moduleError),
    },
  } : undefined;
  return <SettingsDialog {...settings} offlineControls={controls ? <PwaControls {...controls} /> : undefined} />;
}
