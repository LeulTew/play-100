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

export function temporaryLibraryWarning(...details: string[]): string {
  let safetySeen = false;
  const detail = [...new Set(details)].map(message => {
    for (const notice of safetyNotices) {
      message = message.replaceAll(notice, () => {
        if (safetySeen) return '';
        safetySeen = true;
        return notice;
      });
    }
    return message.replace(/ {2,}/g, ' ').trim();
  }).filter(Boolean).join(' ');
  const safety = safetySeen ? '' : ' Your existing saved data has not been overwritten.';
  const reset = detail.includes('reset device data in Settings') ? '' : ', or reset device data in Settings';
  return `${detail}${safety} Changes now work in this tab only; download a backup before closing it${reset}.`;
}
