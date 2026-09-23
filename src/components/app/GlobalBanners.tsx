import { Icon } from '../Icon';

export interface GlobalBannersProps {
  warning: string | null;
  onlineConfigError: string | null;
  offline: boolean;
  offlineReady: boolean;
  hintError: string;
  onSettings: () => void;
  onAccount: () => void;
  onDeviceOnly: () => void;
}

export function GlobalBanners({ warning, onlineConfigError, offline, offlineReady, hintError, onSettings, onAccount, onDeviceOnly }: GlobalBannersProps) {
  return <>
    {warning && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{warning}</p><button className="text-button" onClick={onSettings}>Settings<Icon name="arrow" width="18" height="18" /></button></div></div>}
    {onlineConfigError && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{onlineConfigError}</p></div></div>}
    {offline && <div className="global-storage"><div className="storage-banner" role="status"><Icon name="info" /><p>You are offline.
      {' '}{offlineReady ? 'Prepared public files and this device’s existing library can remain available.' : 'The loaded page and this device’s existing library can still work; prepare offline access when connected for later visits.'}
      {' '}Cloud saving and live source lookups need a connection. Account and guest libraries remain separate.</p></div></div>}
    {hintError && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{hintError} Your libraries have not been cleared. Choose an account check or continue with this device explicitly.</p><button className="text-button" onClick={onAccount}>Open Account</button><button className="text-button" onClick={onDeviceOnly}>Use this device only</button></div></div>}
  </>;
}
