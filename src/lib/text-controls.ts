export function hasAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export const DISPLAY_NAME_MAX = 60;
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/u;

/**
 * The display-name rule firestore.rules `cleanName` enforces: no Unicode control or format character (C0/C1
 * controls, bidi controls, zero-width characters, BOM) anywhere, and 1-60 characters once trimmed.
 * Returns plain error text, or null for a valid name.
 */
export function displayNameProblem(value: string, max = DISPLAY_NAME_MAX): string | null {
  const name = value.trim();
  if (!name || name.length > max) return `Enter a name from 1 to ${max} characters.`;
  if (CONTROL_OR_FORMAT.test(value))
    return 'Names cannot contain invisible, control or text-direction characters. Remove them and try again.';
  return null;
}

/** The trimmed display name, or an Error with displayNameProblem's text. */
export function cleanDisplayName(value: string): string {
  const problem = displayNameProblem(value);
  if (problem) throw new Error(problem);
  return value.trim();
}
