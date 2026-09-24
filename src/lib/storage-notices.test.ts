import { describe, expect, it } from 'vitest';
import { STORAGE_DENIED_MESSAGE, temporaryLibraryWarning } from './storage-notices';

describe('temporary library notices', () => {
  it.each([
    STORAGE_DENIED_MESSAGE,
    'The device library is blocked or is not responding. Your saved data has not been overwritten.',
    'A newer version is using the library. Your data has not been overwritten.',
    'Your previous device library could not be migrated. The original data has not been changed.',
  ])('does not repeat an existing data-safety notice: %s', detail => {
    const message = temporaryLibraryWarning(detail);
    expect(message).toBe(`${detail} Changes now work in this tab only; download a backup before closing it, or reset device data in Settings.`);
    expect(message.match(/has not been (?:overwritten|changed)/g)).toHaveLength(1);
  });

  it('adds the safety notice for an error without one and retains all diagnostic details', () => {
    const detail = 'The library could not be read. Legacy fallback also failed.';
    expect(temporaryLibraryWarning(detail)).toBe(`${detail} Your existing saved data has not been overwritten. Changes now work in this tab only; download a backup before closing it, or reset device data in Settings.`);
  });

  it('does not mistake an unsuccessful write for the saved-data reassurance', () => {
    const message = temporaryLibraryWarning('Your device library could not be opened or saved. No pending changes were saved.');
    expect(message).toContain('No pending changes were saved. Your existing saved data has not been overwritten.');
  });
});
