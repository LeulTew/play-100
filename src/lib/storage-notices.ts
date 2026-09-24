export const STORAGE_DENIED_MESSAGE = 'Device storage is blocked. Allow this site to use device storage and try again. Your saved data has not been overwritten or cleared.';

const safetyNotices = [
  'Your saved data has not been overwritten or cleared.',
  'Your saved library has not been overwritten.',
  'Your existing saved data has not been overwritten.',
  'Your saved data has not been overwritten.',
  'Your data has not been overwritten.',
  'The original data has not been changed.',
];

export function hasStorageSafetyNotice(message: string): boolean {
  return safetyNotices.some(notice => message.includes(notice));
}

export function temporaryLibraryWarning(detail: string): string {
  const safety = hasStorageSafetyNotice(detail) ? '' : ' Your existing saved data has not been overwritten.';
  return `${detail}${safety} Changes now work in this tab only; download a backup before closing it, or reset device data in Settings.`;
}
