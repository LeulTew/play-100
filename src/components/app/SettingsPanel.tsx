import type { ComponentProps } from 'react';
import { SettingsDialog } from '../SettingsDialog';
import PwaControls from '../PwaControls';

export interface SettingsPanelProps {
  settings: ComponentProps<typeof SettingsDialog>;
  offline?: ComponentProps<typeof PwaControls>;
}

export function SettingsPanel({ settings, offline }: SettingsPanelProps) {
  const controls = offline
    ? {
        ...offline,
        pwa: {
          ...offline.pwa,
          online:
            offline.pwa.online &&
            (offline.pwa.controlsReady !== false || (Boolean(offline.pwa.error) && !offline.pwa.moduleError)),
          message:
            offline.pwa.controlsReady === false && !offline.pwa.error
              ? 'Loading offline controls…'
              : offline.pwa.message,
        },
      }
    : undefined;
  return <SettingsDialog {...settings} offlineControls={controls ? <PwaControls {...controls} /> : undefined} />;
}
