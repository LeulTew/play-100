import { expect, it } from 'vitest';
import { hasAsciiControl } from './text-controls';

it('rejects exactly C0 and DEL across every UTF-16 code unit', () => {
  const rejected: number[] = [];
  for (let code = 0; code <= 0xffff; code += 1) {
    if (hasAsciiControl(`before${String.fromCharCode(code)}after`)) rejected.push(code);
  }
  expect(rejected).toEqual([...Array.from({ length: 32 }, (_, code) => code), 127]);
});

it('does not mistake non-ASCII code points or low bytes for ASCII controls', () => {
  for (const value of [
    '',
    ' ',
    '~',
    '\u0080',
    '\u009f',
    '\u00a0',
    '\u0100',
    '\u011f',
    '\u017f',
    '\u2028',
    '\u2029',
    '\ud800',
    '\udfff',
    '\u{1f600}',
    '\u{10000}',
    '\u{1001f}',
    '\u{1007f}',
  ]) {
    expect(hasAsciiControl(value)).toBe(false);
    expect(hasAsciiControl(`${value}\u0000`)).toBe(true);
    expect(hasAsciiControl(`\u007f${value}`)).toBe(true);
  }
});
