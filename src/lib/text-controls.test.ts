import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { cleanDisplayName, displayNameProblem, hasAsciiControl } from './text-controls';

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

it('rejects bidi, zero-width, BOM and other control or format characters anywhere in a display name', () => {
  const rejected = [0x0000, 0x0009, 0x000a, 0x007f, 0x0085, 0x00ad, 0x061c, 0x180e, 0x2060, 0xfeff, 0xe0041];
  for (let code = 0x200b; code <= 0x200f; code += 1) rejected.push(code);
  for (let code = 0x202a; code <= 0x202e; code += 1) rejected.push(code);
  for (let code = 0x2066; code <= 0x2069; code += 1) rejected.push(code);
  for (const code of rejected) {
    const character = String.fromCodePoint(code);
    for (const name of [`Player${character}name`, `${character}Player`, `Player${character}`]) {
      expect(displayNameProblem(name)).toMatch(/invisible, control or text-direction/);
      expect(() => cleanDisplayName(name)).toThrow(/invisible, control or text-direction/);
    }
  }
});

it('accepts ordinary Unicode names and trims surrounding whitespace to the 1-60 character rule', () => {
  for (const name of ['Zoë', 'Łukasz', 'سارة', '田中', "O'Brien", 'A\u00a0B', 'Gamer 🎮', 'x'.repeat(60)]) {
    expect(displayNameProblem(name)).toBeNull();
    expect(cleanDisplayName(` ${name}\u3000`)).toBe(name);
  }
  for (const name of ['', '   ', '\u00a0', 'x'.repeat(61)]) expect(displayNameProblem(name)).toMatch(/1 to 60/);
});

it('keeps the rules backstop list equal to every format character this engine classes as \\p{Cf}', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const list = /let invisible = ([^;]+);/.exec(rules)?.[1] ?? '';
  const listed = [...list.matchAll(/\\\\x\{([0-9a-f]+)\}(?:-\\\\x\{([0-9a-f]+)\})?/g)].map((match) => [
    parseInt(match[1]!, 16),
    parseInt(match[2] ?? match[1]!, 16),
  ]);
  const expected: number[][] = [];
  let start = -1;
  for (let code = 0; code <= 0x110000; code += 1) {
    const format = code < 0x110000 && /\p{Cf}/u.test(String.fromCodePoint(code));
    if (format && start < 0) start = code;
    if (!format && start >= 0) {
      expected.push([start, code - 1]);
      start = -1;
    }
  }
  expect(listed.length).toBeGreaterThan(0);
  expect(listed).toEqual(expected);
});
