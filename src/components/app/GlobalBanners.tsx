import { Icon } from '../Icon';
import { hasStorageSafetyNotice, STORAGE_DENIED_MESSAGE } from '../../lib/storage-notices';

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
  const sharedDenial = hintError === STORAGE_DENIED_MESSAGE &&
    (warning === hintError || Boolean(warning?.startsWith(`${hintError} `)));
  const accountActions = <>
    <button className="text-button" onClick={onAccount}>Open Account</button>
    <button className="text-button" onClick={onDeviceOnly}>Use this device only</button>
  </>;
  const accountChoice = 'Choose an account check or continue with this device explicitly.';
  return <>
    {warning && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{warning}{sharedDenial && ` ${accountChoice}`}</p><button className="text-button" onClick={onSettings}>Settings<Icon name="arrow" width="18" height="18" /></button>{sharedDenial && accountActions}</div></div>}
    {onlineConfigError && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{onlineConfigError}</p></div></div>}
    {offline && <div className="global-storage"><div className="storage-banner" role="status"><Icon name="info" /><p>You are offline.
      {' '}{offlineReady ? 'Prepared app files and saved device games can work offline.' : 'The loaded page and saved device games can still work. Enable offline access in Settings when connected.'}
      {' '}Cloud saving and live lookups need a connection. Guest and account libraries stay separate.</p></div></div>}
    {hintError && !sharedDenial && <div className="global-storage"><div className="storage-banner" role="alert"><Icon name="info" /><p>{hintError}{!hasStorageSafetyNotice(hintError) && ' Your libraries have not been cleared.'} {accountChoice}</p>{accountActions}</div></div>}
  </>;
}
