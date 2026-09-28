import type { MouseEvent, ReactNode } from 'react';
import type { OnlineBridge } from '../../cloud/ui-types';
import type { useCapabilities } from '../../hooks/useCapabilities';
import type { useCollection } from '../../hooks/useCollection';
import type { useLibrary } from '../../hooks/useLibrary';
import type { useUrlState } from '../../hooks/useUrlState';
import type { AccountInvocation } from '../../lib/app-commands';
import type { InviteContinuation } from '../../lib/invite-continuation';
import type { NoticeStore } from '../../lib/notice-store';
import type { LibraryRecord, PersonalAction } from '../../lib/personal-types';
import type { SignInPurpose } from '../../lib/sign-in-purpose';
import type { AppPage, Filters, Game, MotionPreference } from '../../lib/types';
import type { usePwa } from '../../pwa/usePwa';
import type { AppPanel } from '../../lib/secondary-dialogs';
import type { CatalogOwnership } from '../../lib/catalog-identity';
import type { DialogHostProps } from './DialogHost';
import type { LibraryScope } from '../../lib/cloud-types';

type UrlState = ReturnType<typeof useUrlState>;
type Library = ReturnType<typeof useLibrary>;

/**
 * App's commands. Each keeps its identity for the app's lifetime and runs the latest committed handler, so passing one
 * never re-renders a memoised child. Never call one during render.
 */
export interface AppCommands {
  navigate(next: AppPage, patch?: Partial<Filters>): void;
  navigateLink(
    event: MouseEvent<HTMLAnchorElement>,
    next: AppPage,
    patch?: Partial<Filters>,
    commit?: () => void,
  ): Promise<void> | undefined;
  guardedNavigation(commit: () => void): Promise<void>;
  accountEntry(invocation?: AccountInvocation): Promise<void>;
  closeAccountSheet(): void;
  browse(): void;
  shareView(slug?: string | null): void;
  share(title: string, url: string, privateFilter: boolean): void;
  toggle(id: string, key: 'later' | 'completed' | 'played', value?: boolean): void;
  rankSelected(): void;
  compareGames(records: LibraryRecord[]): Promise<void>;
  perform(action: PersonalAction, announce?: boolean): Promise<boolean>;
  performDetailAction(action: PersonalAction): Promise<boolean>;
  enablePublicDetails(): Promise<void>;
  applyPwaUpdate(): ReturnType<ReturnType<typeof usePwa>['applyUpdate']>;
  setPanel(next: AppPanel): void;
  openSettings(offline?: boolean): void;
  dismissPanelMessage(): void;
  closeManualLink(): void;
  onDevice(): void;
  onFailedChange(failed: boolean): void;
  onDeviceOnly(): void;
  onBridge(bridge: OnlineBridge | null): void;
  onCompareSignIn(uid: string, pins: LibraryRecord[], signedIn: () => boolean): void;
  setCompareTrayVisible(visible: boolean): void;
  /** False while the account opens or before the library shows the current scope. */
  pinAllowed(): boolean;
  resetLibrary: Library['reset'];
  restoreLibrary: Library['restore'];
}

/** Everything the app shell renders, as App derived it in this render. */
export interface AppModel {
  page: AppPage;
  personalPage: AppPage;
  gamesView: UrlState['gamesView'];
  filters: Filters;
  selectedSlug: string | null;
  publicHandle: string;
  openGame: UrlState['openGame'];
  closeGame: UrlState['closeGame'];
  openProfile: UrlState['openProfile'];
  updateFilters: UrlState['updateFilters'];
  changeGamesView: UrlState['changeGamesView'];
  invitation: InviteContinuation;
  cloudPage: boolean;
  privateLoading: boolean;
  collection: ReturnType<typeof useCollection>;
  games: Game[] | undefined;
  guestLibrary: Library;
  library: Pick<Library, 'state' | 'status' | 'error'>;
  libraryBusy: boolean;
  libraryScope: LibraryScope;
  libraryLabel: string;
  online: OnlineBridge | null;
  onlineOpening: boolean;
  showOnline: boolean;
  hintError: string;
  headerIdentity: OnlineBridge['headerIdentity'];
  savedCount: number;
  completedCount: number;
  warning: string | null;
  capabilities: ReturnType<typeof useCapabilities>;
  effectiveMotion: MotionPreference;
  motionPending: boolean;
  panel: AppPanel;
  panelMessage: string;
  panelMessageError: boolean;
  panelFailure: 'about' | 'settings' | null;
  panelFromMenu: boolean;
  offlineSettings: boolean;
  pwaEnabled: boolean;
  pwa: ReturnType<typeof usePwa>;
  selectedGame: Game | undefined;
  selectedRecord: LibraryRecord | undefined;
  selectedPersonalRecord: LibraryRecord | undefined;
  rankingPosition: number;
  ownership: CatalogOwnership;
  allRecords: ReadonlyMap<string, LibraryRecord>;
  awaitingCanonicalPreview: boolean;
  publicLookup: NonNullable<DialogHostProps['catalog']>['props']['publicLookup'];
  manualLink: string | null;
  sharing: boolean;
  toolFailure: { scope: string; page: AppPage } | null;
  motionBlocked: boolean;
  signInPurpose: SignInPurpose | undefined;
  getSignInReturnFocus: (authenticated?: boolean) => HTMLElement | null;
  captureFocusGuard: () => () => boolean;
  notices: NoticeStore;
  pageHref: (next: AppPage, patch?: Partial<Filters>) => string;
  renderDragHandle: (record: LibraryRecord) => ReactNode;
  commands: AppCommands;
}
