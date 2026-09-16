import type { PersonalAction, PersonalLibraryState } from './personal-types';
import type { LibraryScope } from './cloud-types';

export interface LibraryController {
  state: PersonalLibraryState;
  status: 'loading' | 'ready' | 'temporary';
  warning: string | null;
  error: string | null;
  busy: boolean;
  perform: (action: PersonalAction) => Promise<boolean>;
  restore: (state: PersonalLibraryState) => Promise<boolean>;
  reset: () => Promise<boolean>;
}

export interface ActiveLibraryMode {
  scope: LibraryScope;
  onlineEnabled: boolean;
  label: string;
}
