import { lazy, Suspense } from 'react';
import { Icon } from '../Icon';
import { ChunkRecovery } from '../ChunkRecovery';
import { ChunkBoundary } from '../ChunkBoundary';
import { hasStorageSafetyNotice, STORAGE_DENIED_MESSAGE } from '../../lib/storage-notices';
import { loadStorageRecovery } from '../../lib/storage-recovery-preload';
import type { GlobalBannersProps } from './StorageRecovery';
export type { GlobalBannersProps } from './StorageRecovery';

const StorageRecovery = lazy(loadStorageRecovery);

function DeferredRecovery(props: GlobalBannersProps) {
  const fallback = (failed = false) => (
    <div className="global-storage">
      <div className="storage-banner" role="alert">
        <Icon name="info" />
        <p>{props.warning ?? props.hintError}</p>
        {failed ? (
          <ChunkRecovery message="Device recovery tools didn't load. Your data is unchanged." />
        ) : (
          <span role="status">Loading recovery controls…</span>
        )}
        <button className="text-button" onClick={props.onSettings}>
          Settings
          <Icon name="arrow" width="18" height="18" />
        </button>
      </div>
    </div>
  );
  return (
    <ChunkBoundary fallback={fallback(true)}>
      <Suspense fallback={fallback()}>
        <StorageRecovery {...props} />
      </Suspense>
    </ChunkBoundary>
  );
}

export function GlobalBanners(props: GlobalBannersProps) {
  const {
    warning,
    onlineConfigError,
    offline,
    offlineReady,
    hintError,
    hintBlocked,
    onSettings,
    onAccount,
    onDeviceOnly,
  } = props;
  const sharedDenial =
    hintError === STORAGE_DENIED_MESSAGE && (warning === hintError || Boolean(warning?.startsWith(`${hintError} `)));
  const accountActions = (
    <>
      <button className="text-button" onClick={onAccount}>
        Open Account
      </button>
      <button className="text-button" onClick={onDeviceOnly}>
        Use this device only
      </button>
    </>
  );
  const accountChoice = 'Choose an account check or continue with this device explicitly.';
  return (
    <>
      {props.onRetryLibrary ? (
        <DeferredRecovery {...props} />
      ) : (
        warning && (
          <div className="global-storage">
            <div className="storage-banner" role="alert">
              <Icon name="info" />
              <p>
                {warning}
                {sharedDenial && ` ${accountChoice}`}
              </p>
              <button className="text-button" onClick={onSettings}>
                Settings
                <Icon name="arrow" width="18" height="18" />
              </button>
              {sharedDenial && accountActions}
            </div>
          </div>
        )
      )}
      {onlineConfigError && (
        <div className="global-storage">
          <div className="storage-banner" role="alert">
            <Icon name="info" />
            <p>{onlineConfigError}</p>
          </div>
        </div>
      )}
      {offline && (
        <div className="global-storage">
          <div className="storage-banner" role="status">
            <Icon name="info" />
            <p>
              You are offline.{' '}
              {offlineReady
                ? 'Prepared app files and saved device games can work offline.'
                : 'The loaded page and saved device games can still work. Enable offline access in Settings when connected.'}{' '}
              Online saving and live lookups need a connection.
            </p>
          </div>
        </div>
      )}
      {hintError && !sharedDenial && !hintBlocked && (
        <div className="global-storage">
          <div className="storage-banner" role="alert">
            <Icon name="info" />
            <p>
              {hintError}
              {!hasStorageSafetyNotice(hintError) && ' Your libraries have not been cleared.'} {accountChoice}
            </p>
            {accountActions}
          </div>
        </div>
      )}
    </>
  );
}
