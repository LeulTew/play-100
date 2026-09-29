import { useEffect, useRef, useState } from 'react';
import { EmailAuthProvider } from 'firebase/auth';
import type { SyncHead } from '../lib/cloud-types';
import { displayNameProblem } from '../lib/text-controls';
import { hasProvider } from './account-providers';
import { createAccountDeletion } from './account-deletion-action';
import type { AccountPageProps, ConnectionChoice } from './AccountPage';

export function useAccountPage({
  identity,
  member,
  cache,
  guest,
  head,
  remoteReady,
  googleDeletion,
  onDismissDeletion,
  onSignOutAndRemove,
  onPause,
  onUseRemote,
  onUseLocal,
  deletion,
}: AccountPageProps) {
  const onDelete = createAccountDeletion(deletion);
  const currentName = member?.displayName || cache?.profile?.displayName || identity.displayName || 'Player';
  const [draftName, setDraftName] = useState(currentName);
  const [nameEdited, setNameEdited] = useState(false);
  // The field shows the account's name until the user edits it, and again once that edit is saved.
  const name = nameEdited ? draftName : currentName;
  const [nameError, setNameError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const [choice, setChoice] = useState<ConnectionChoice | null>(null);
  const [confirmation, setConfirmation] = useState<
    'pause' | 'remote' | 'local' | 'delete-copy' | 'delete-account' | 'signout-device' | null
  >(null);
  const [password, setPassword] = useState('');
  const [conflictVersion, setConflictVersion] = useState<{ head: SyncHead; localRevision: number } | null>(null);
  const resumedDeletion = useRef<string | null>(null);
  const active = Boolean(cache?.sync.enabled);
  const localGames = Object.keys(cache?.state.records ?? {}).length;
  const guestGames = Object.keys(guest.records).length;
  const choices: Array<{ value: ConnectionChoice; label: string; detail: string }> = [];
  if (head?.current)
    choices.push({
      value: 'online',
      label: 'Online library',
      detail: member
        ? `${member.gameCount} ${member.gameCount === 1 ? 'game' : 'games'}, ${member.rankCount} ranked`
        : 'Existing saved copy',
    });
  if (guestGames)
    choices.push({
      value: 'guest',
      label: 'Device-only library',
      detail: `${guestGames} ${guestGames === 1 ? 'game' : 'games'}, ${guest.ranking.length} ranked`,
    });
  if (localGames || (cache?.sync.epoch ?? 0) > 0)
    choices.push({
      value: 'cached',
      label: 'Account copy on this device',
      detail: `${localGames} ${localGames === 1 ? 'game' : 'games'}, ${cache?.state.ranking.length ?? 0} ranked`,
    });
  if (remoteReady && !head?.current)
    choices.push({ value: 'empty', label: 'Empty library', detail: 'No device games uploaded' });
  const selected = choice ?? choices[0]?.value ?? 'empty';
  const validChoice = choices.some((item) => item.value === selected);
  const replacing = Boolean(head?.current && selected !== 'online');
  useEffect(() => {
    if (googleDeletion && resumedDeletion.current !== googleDeletion.requestId) {
      resumedDeletion.current = googleDeletion.requestId;
      setConfirmation(googleDeletion.target === 'account' ? 'delete-account' : 'delete-copy');
    }
  }, [googleDeletion]);
  const validName = () => {
    const problem = displayNameProblem(name);
    if (!problem) {
      setNameError('');
      return true;
    }
    setNameError(problem);
    nameInput.current?.focus();
    return false;
  };
  const closeConfirmation = () => {
    setConfirmation(null);
    setPassword('');
    onDismissDeletion();
  };
  const googleConfirmation =
    confirmation?.startsWith('delete') && !hasProvider(identity, EmailAuthProvider.PROVIDER_ID);
  const googleConfirmed = googleDeletion?.target === (confirmation === 'delete-account' ? 'account' : 'copy');
  const confirm = async () => {
    const result =
      confirmation === 'signout-device'
        ? await onSignOutAndRemove?.()
        : confirmation === 'pause'
          ? await onPause()
          : confirmation === 'remote'
            ? conflictVersion && (await onUseRemote(conflictVersion.head, conflictVersion.localRevision))
            : confirmation === 'local'
              ? conflictVersion && (await onUseLocal(conflictVersion.head, conflictVersion.localRevision))
              : await onDelete(confirmation === 'delete-account', password);
    if (result) closeConfirmation();
  };

  return {
    name,
    nameEdited,
    setNameEdited,
    setDraftName,
    nameError,
    setNameError,
    nameInput,
    setChoice,
    confirmation,
    setConfirmation,
    password,
    setPassword,
    setConflictVersion,
    active,
    localGames,
    choices,
    selected,
    validChoice,
    replacing,
    validName,
    closeConfirmation,
    googleConfirmation,
    googleConfirmed,
    confirm,
  };
}

export type AccountPageModel = ReturnType<typeof useAccountPage>;
