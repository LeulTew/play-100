import { exportLibraryBackup } from '../lib/personal-library';
import type { PersonalLibraryState } from '../lib/personal-types';

/** The compact library backup the Backup import accepts, within its byte budget; otherwise the refusal says how much to remove. */
export function libraryBackupText(state: PersonalLibraryState, budget?: number): string {
  const backup = exportLibraryBackup(state, budget);
  if (!backup.ok) throw new Error(backup.message);
  return backup.text;
}
