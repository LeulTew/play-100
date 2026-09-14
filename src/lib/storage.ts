import type { LibraryState, Progress } from './types';

export const STORAGE_KEY = 'play100.library.v1';
export const emptyLibrary = (): LibraryState => ({ version: 1, progress: {}, motion: 'auto' });

export function parseLibrary(raw: string | null): LibraryState {
  if (raw === null) return emptyLibrary();
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1 ||
    !('progress' in value) || typeof value.progress !== 'object' || value.progress === null ||
    Array.isArray(value.progress) || !('motion' in value) ||
    !['auto', 'full', 'lite'].includes(String(value.motion))
  ) {
    throw new Error('Saved device data has an unsupported format.');
  }
  const progress: Progress = {};
  for (const [slug, state] of Object.entries(value.progress)) {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug === '__proto__' ||
      typeof state !== 'object' || state === null || !('later' in state) || !('completed' in state) ||
      typeof state.later !== 'boolean' || typeof state.completed !== 'boolean'
    ) {
      throw new Error('Saved game progress could not be read.');
    }
    progress[slug] = { later: state.later, completed: state.completed };
  }
  return { version: 1, progress, motion: value.motion === 'full' ? 'full' : value.motion === 'lite' ? 'lite' : 'auto' };
}

export interface LibrarySnapshot {
  state: LibraryState;
  status: 'ready' | 'blocked' | 'corrupt';
  warning: string | null;
}

export function readLibrary(): LibrarySnapshot {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return {
      state: emptyLibrary(), status: 'blocked',
      warning: 'Device storage is blocked. Your changes work in this tab but will not survive a reload.',
    };
  }
  try {
    return { state: parseLibrary(raw), status: 'ready', warning: null };
  } catch {
    return {
      state: emptyLibrary(), status: 'corrupt',
      warning: 'Your saved device data could not be read. It has not been overwritten. Reset device data in Settings to start fresh.',
    };
  }
}
