import { describe, expect, it } from 'vitest';
import {
  hasText,
  isRecord,
  labelledObject,
  labelledText,
  nullableObject,
  nullableText,
  objectOrEmpty,
  requireObject,
  requireText,
} from './guards';

describe('shared validation contracts', () => {
  it.each([null, undefined, [], '', 1, true, () => {}])('rejects non-record %s without coercion', (value) => {
    expect(isRecord(value)).toBe(false);
    expect(nullableObject(value)).toBeNull();
    expect(() => requireObject(value)).toThrow('Expected a JSON object.');
    expect(() => labelledObject(value, 'catalog')).toThrow('Invalid catalog: expected an object.');
  });

  it('leaves prototype, key and descriptor policies to the domain validators without reading getters', () => {
    const getter = {
      get title(): never {
        throw new Error('must not read');
      },
    };
    for (const value of [{}, Object.create(null), new Date(), getter]) {
      expect(nullableObject(value)).toBe(value);
      expect(requireObject(value)).toBe(value);
    }
    const array: unknown[] = [];
    expect(objectOrEmpty(array)).toBe(array);
    expect(objectOrEmpty(null)).toEqual({});
    expect(objectOrEmpty('text')).toEqual({});
  });

  it('preserves whitespace for throwing guards and trims only the nullable provider variant', () => {
    expect(hasText('  title  ')).toBe(true);
    expect(nullableText('  title  ')).toBe('title');
    expect(requireText('  title  ')).toBe('  title  ');
    for (const value of [null, undefined, 4, '', ' \t']) {
      expect(nullableText(value)).toBeNull();
      expect(() => requireText(value)).toThrow('Expected a non-empty string.');
    }
  });

  it('retains labelled limits, optional emptiness, error type and exact raw length boundaries', () => {
    class DomainError extends Error {}
    const invalid = (message: string): never => {
      throw new DomainError(message);
    };
    expect(labelledText('', 'Name', 2, false, invalid)).toBe('');
    expect(labelledText(' x', 'Name', 2, true, invalid)).toBe(' x');
    expect(() => labelledText(' x ', 'Name', 2, true, invalid)).toThrow(DomainError);
    expect(() => labelledText('   ', 'Name', 2, true, invalid)).toThrow(
      'Name must be nonempty text of at most 2 characters.',
    );
    expect(() => requireObject([], () => invalid('object'))).toThrow(DomainError);
    expect(requireText('\u0000')).toBe('\u0000');
  });
});
