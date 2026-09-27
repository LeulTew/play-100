export function hasAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export const DISPLAY_NAME_MAX = 60;
// The line and paragraph separators (U+2028, U+2029) force a line break, which could fake a second line under a name.
const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const CONTROL_OR_FORMAT_ALL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * Whether text contains a Unicode control (C0/C1), format character (bidi controls, zero-width characters, BOM) or
 * forced line break, which firestore.rules refuses in new display names and in new public and shared ranking titles.
 */
export function hasControlOrFormat(value: string): boolean {
  return CONTROL_OR_FORMAT.test(value);
}

/** The text without its control and format characters, for naming it in an error message. */
export function stripControlOrFormat(value: string): string {
  return value.replace(CONTROL_OR_FORMAT_ALL, '');
}

/** Letters and symbols that render as nothing: the Hangul fillers and the blank Braille pattern (rules cleanName). */
export const BLANK_CHARACTERS = [0x115f, 0x1160, 0x2800, 0x3164, 0xffa0] as const;
const BLANK = new RegExp(`[${BLANK_CHARACTERS.map((code) => `\\u{${code.toString(16)}}`).join('')}]`, 'u');
const NOTHING_VISIBLE = /^[\p{M}\p{Z}]+$/u;

/**
 * The display-name rule firestore.rules `cleanName` enforces: no Unicode control or format character (C0/C1
 * controls, bidi controls, zero-width characters, BOM) or blank filler anywhere, at least one character that is not
 * a combining mark or space, and 1-60 characters once trimmed. Returns plain error text, or null for a valid name.
 */
export function displayNameProblem(value: string, max = DISPLAY_NAME_MAX): string | null {
  const name = value.trim();
  if (!name || name.length > max) return `Enter a name from 1 to ${max} characters.`;
  if (hasControlOrFormat(value))
    return 'Names cannot contain invisible, control or text-direction characters. Remove them and try again.';
  if (BLANK.test(name) || NOTHING_VISIBLE.test(name))
    return 'Names need a visible letter, number or symbol and cannot contain blank filler characters.';
  return null;
}

/** Plain error text for a ranking title that firestore.rules `cleanTitle` refuses, or null; callers check length. */
export function rankingTitleProblem(value: string): string | null {
  return hasControlOrFormat(value)
    ? 'Ranking titles cannot contain invisible, control or text-direction characters. Remove them and try again.'
    : null;
}

/** The trimmed display name, or an Error with displayNameProblem's text. */
export function cleanDisplayName(value: string): string {
  const problem = displayNameProblem(value);
  if (problem) throw new Error(problem);
  return value.trim();
}
