import type { AccountIdentity } from '../cloud/ui-types';
import type { LibraryScope } from './cloud-types';
import { isModuleLoadFailure } from './chunk-recovery';
import { patchDiscoverySearch } from './discovery-search';
import { flushPendingEdits } from '../hooks/useExitSave';
import { editFlush } from './edit-flush';
import { loadComparisonTools } from './app-tool-preload';
import type { LibraryRecord } from './personal-types';
import { usableReturnFocusTarget } from './return-focus';
import type { AppPage } from './types';
import { captureView } from './view-guard';

/** Every command first saves the open edits, and lands only in the scope, navigation and view it started in. */
interface CommandContext {
  captureFocusGuard: () => () => boolean;
  notify: (message: string) => void;
}

export type AccountInvocation = 'account' | 'compare';

/** Opens the account after saving the open edits; a blocked or failed save focuses the editor again at once. */
export async function enterAccount(
  context: CommandContext & { open: (invocation: AccountInvocation, isCurrent: () => boolean) => void },
  invocation: AccountInvocation,
) {
  const currentScopeAndNavigation = context.captureFocusGuard();
  const view = captureView();
  const isCurrent = () => currentScopeAndNavigation() && view();
  const flush = editFlush();
  const returnToEdit = () => {
    const target = flush.target;
    if (usableReturnFocusTarget(target)) {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      target.focus({ preventScroll: true });
    }
  };
  try {
    const saved = await flush.run();
    if (!isCurrent()) return;
    if (!saved) {
      context.notify('Finish or correct the open rating or note before changing accounts.');
      returnToEdit();
      return;
    }
    context.open(invocation, isCurrent);
  } catch (cause) {
    console.error(
      'Account could not save pending edits.',
      cause instanceof Error ? cause.message : 'Unknown editor failure.',
    );
    if (isCurrent()) {
      context.notify('Your edit could not be saved. Keep this page open and retry.');
      returnToEdit();
    }
  }
}

export interface ComparisonContext extends CommandContext {
  opening: boolean;
  identity: AccountIdentity | null | undefined;
  /** The identity the account reports now, not when the command started. */
  currentIdentity: () => AccountIdentity | null | undefined;
  libraryScope: LibraryScope;
  page: AppPage;
  captureIntent: (current: () => boolean) => () => boolean;
  recover: (target: HTMLElement | null, isCurrent: () => boolean) => void;
  clearRecovery: () => void;
  signIn: () => Promise<void>;
  navigate: (page: AppPage) => void;
  toolFailure: (failure: { scope: string; page: AppPage }) => void;
}

/** Compares the pinned games with friends: a guest signs in first, and an unverified account opens Account. */
export async function startComparison(context: ComparisonContext, records: LibraryRecord[]) {
  const { notify, libraryScope } = context;
  const scopeAndNavigation = context.captureFocusGuard();
  if (context.opening) {
    notify('Wait for your account to finish opening before comparing.');
    return;
  }
  if (!context.identity || libraryScope === 'guest') {
    await context.signIn();
    return;
  }
  if (!context.identity.verified) {
    notify('Verify your account before comparing with friends.');
    context.navigate('account');
    return;
  }
  const identity = context.identity;
  const isCurrent = context.captureIntent(() => {
    const current = context.currentIdentity();
    return scopeAndNavigation() && current?.uid === identity.uid && current.verified;
  });
  const flush = editFlush();
  context.clearRecovery();
  try {
    const [
      { createComparisonGameFilter, rememberComparisonGameFilter },
      { comparisonScope, initialComparison, readComparisonView, rememberComparisonView },
    ] = await loadComparisonTools();
    if (!isCurrent()) return;
    const filter = createComparisonGameFilter(libraryScope, records);
    const saved = await flush.run();
    if (!isCurrent()) return;
    if (!saved) {
      notify('Correct the open edit before starting a comparison.');
      context.recover(flush.target, isCurrent);
      return;
    }
    const project = libraryScope.split(':')[1] ?? '';
    const scope = comparisonScope(project, identity.uid);
    const prior = readComparisonView(scope) ?? initialComparison(scope, identity.uid);
    context.navigate('compare');
    rememberComparisonView({ ...prior, mode: 'all-shared', query: '', page: 1 }, true);
    const warning = rememberComparisonGameFilter(filter);
    if (warning) notify(warning);
  } catch (cause) {
    if (isCurrent()) {
      if (isModuleLoadFailure(cause)) context.toolFailure({ scope: libraryScope, page: context.page });
      else notify(cause instanceof Error ? cause.message : 'The game comparison could not be opened.');
      if (flush.target) context.recover(flush.target, isCurrent);
    } else
      console.warn('A comparison operation failed after its page or account changed. No stale navigation was applied.');
  }
}

/** Turns on online lookup for the open catalog detail, once the open edit is saved. */
export async function enableOnlineDetails(context: CommandContext) {
  const currentScopeAndNavigation = context.captureFocusGuard();
  const view = captureView();
  try {
    if (!(await flushPendingEdits())) {
      context.notify('Correct the open edit before changing online lookup.');
      return;
    }
    if (!currentScopeAndNavigation() || !view()) return;
    const search = patchDiscoverySearch(window.location.search, { catalogs: 'on' });
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
    window.dispatchEvent(new Event('play100:navigate'));
  } catch (cause) {
    console.error(
      'Online details could not save the pending edit.',
      cause instanceof Error ? cause.message : 'Unknown editor failure.',
    );
    if (currentScopeAndNavigation()) context.notify('Your edit could not be saved. Keep this game open and retry.');
  }
}
