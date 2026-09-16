import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Avatar as DiceBearAvatar } from '@dicebear/core';
import definition from '@dicebear/styles/critters.json' with { type: 'json' };
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AVATAR_PALETTES, createAvatarCandidates, createAvatarDescriptor, generateAvatarDataUri,
  generateAvatarSvg, isAvatarDescriptor, isAvatarPalette, parseAvatarDescriptor,
} from './avatar';
import type { AvatarDescriptor, AvatarPalette } from './avatar';

const original: AvatarDescriptor = { version: 1, seed: '0123456789abcdef0123456789abcdef', palette: 'lime' };
const palettes: AvatarPalette[] = ['lime', 'moss', 'clay', 'sky', 'lilac'];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const withoutIds = (svg: string) => svg.replace(/-[0-9a-f]{8}(?=["')])/g, '');

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('avatar descriptor boundary', () => {
  it('accepts each supported palette, copies metadata and round-trips JSON', () => {
    for (const palette of palettes) {
      const value = Object.freeze({ ...original, palette });
      expect(isAvatarPalette(palette)).toBe(true);
      expect(isAvatarDescriptor(value)).toBe(true);
      expect(parseAvatarDescriptor(value)).toEqual(value);
      expect(parseAvatarDescriptor(value)).not.toBe(value);
      expect(parseAvatarDescriptor(JSON.parse(JSON.stringify(value)))).toEqual(value);
    }
  });

  it.each([
    null, undefined, true, 1, [], original.seed, JSON.stringify(original),
    {}, { ...original, version: 0 }, { ...original, version: 2 }, { ...original, version: '1' },
    { ...original, seed: null }, { ...original, seed: 123 }, { ...original, seed: '' },
    { ...original, seed: 'a'.repeat(31) }, { ...original, seed: 'a'.repeat(33) },
    { ...original, seed: 'A'.repeat(32) }, { ...original, seed: 'g'.repeat(32) },
    { ...original, seed: `${'a'.repeat(32)}\n` }, { ...original, seed: `${'a'.repeat(32)}\r\n` },
    { ...original, seed: `${'a'.repeat(31)} ` }, { ...original, seed: '0'.repeat(100_000) },
    { ...original, seed: '０'.repeat(32) }, { ...original, seed: '<script>alert(1)</script>' },
    { ...original, palette: 'Lime' }, { ...original, palette: 'transparent' },
    { ...original, palette: ['lime'] }, { ...original, palette: '__proto__' },
    { ...original, palette: null }, { ...original, palette: 0 },
    { ...original, options: {} }, { ...original, svg: '<svg/>' }, { ...original, url: 'https://example.test/avatar' },
    { ...original, extra: undefined }, { ...original, [Symbol('extra')]: true },
    Object.assign([], original), { seed: original.seed, palette: 'lime' },
    { version: 1, palette: 'lime' }, { version: 1, seed: original.seed },
  ])('rejects malformed or expanded metadata %# without replacement', (value) => {
    expect(isAvatarDescriptor(value)).toBe(false);
    expect(() => parseAvatarDescriptor(value)).toThrow(TypeError);
    expect(() => Reflect.apply(generateAvatarSvg, undefined, [value])).toThrow(TypeError);
    expect(() => Reflect.apply(generateAvatarDataUri, undefined, [value])).toThrow(TypeError);
  });

  it('rejects hidden keys and accessor properties without evaluating them', () => {
    const hidden = Object.defineProperty({ ...original }, 'rawSvg', { value: '<svg/>' });
    const getter = vi.fn(() => original.seed);
    const accessor = Object.defineProperty({ ...original }, 'seed', { get: getter });
    expect(isAvatarDescriptor(hidden)).toBe(false);
    expect(isAvatarDescriptor(accessor)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(isAvatarDescriptor(Object.create(original))).toBe(false);
  });
});

describe('private random seeds', () => {
  it('encodes all 16 crypto bytes exactly, including leading zeroes', () => {
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (!(array instanceof Uint8Array) || array.length !== 16) throw new Error('Expected 16 random bytes');
      array.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 254, 255]);
      return array;
    });
    expect(createAvatarDescriptor('clay')).toEqual({ version: 1, seed: '000102030405060708090a0b0c0dfeff', palette: 'clay' });
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('creates valid 128-bit seeds without Math.random or identity input', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Insecure random source'); });
    const values = Array.from({ length: 256 }, () => createAvatarDescriptor());
    expect(values.every(isAvatarDescriptor)).toBe(true);
    expect(new Set(values.map((value) => value.seed)).size).toBe(values.length);
    expect(generateAvatarSvg(values[0] ?? original)).toContain('<svg ');
  });

  it('fails explicitly for invalid palettes or unavailable crypto', () => {
    expect(() => Reflect.apply(createAvatarDescriptor, undefined, ['unknown'])).toThrow('Unsupported avatar palette');
    vi.stubGlobal('crypto', undefined);
    expect(() => createAvatarDescriptor()).toThrow('Secure randomness is unavailable');
    expect(generateAvatarSvg(original)).toContain('<svg ');
  });
});

describe('frozen local Critters recipe', () => {
  it('pins the exact packages, single definition, license metadata and core notice', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(manifest.dependencies['@dicebear/core']).toBe('10.7.0');
    expect(manifest.dependencies['@dicebear/styles']).toBe('10.6.0');
    const raw = readFileSync(new URL('../../node_modules/@dicebear/styles/dist/critters.min.json', import.meta.url), 'utf8');
    expect(Buffer.byteLength(raw)).toBe(53_270);
    expect(sha256(raw)).toBe('df67e34f221589c4949d989996008158d6cdfdcd4149ff92297c51077ca59e9e');
    expect(definition.$schema).toContain('@dicebear/schema@1.4.0');
    expect(JSON.parse(readFileSync(new URL('../../third-party/dicebear/critters-meta.json', import.meta.url), 'utf8'))).toEqual(definition.meta);
    expect(readFileSync(new URL('../../third-party/dicebear/core-LICENSE.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n').trim())
      .toBe(readFileSync(new URL('../../node_modules/@dicebear/core/LICENSE', import.meta.url), 'utf8').trim());
  });

  it.each([
    ['0', 'lime', '73018476a58d24d0556741300656e8b1cb1f5a9952692ede35fc75d6eaf9ad19'],
    ['1', 'moss', '8035aee1dfef3c125686bdefff427f21e15deb1116f3841231672644a107da55'],
    ['2', 'clay', '4dfe25bb9b1fb848f379ccc161abd820e558aea26c36cdc565873a1d317ed1e4'],
    ['3', 'sky', 'f16daa244344fd928518bdf441190ff5647e0c79a2fe447b1d7ed85787535062'],
    ['4', 'lilac', 'c5af5a7284e7210aae5f696acdf75482d6e52b5af226af2658a30eed55d26bb4'],
  ])('preserves the v1 golden SVG for seed %s / %s', (digit, palette, expected) => {
    if (!isAvatarPalette(palette)) throw new Error('Invalid golden palette');
    expect(sha256(generateAvatarSvg({ version: 1, seed: digit.repeat(32), palette }))).toBe(expected);
  });

  it('is byte-stable across object identity, render order and module reload', async () => {
    const svg = generateAvatarSvg(original);
    for (const palette of palettes) generateAvatarSvg({ ...original, palette });
    expect(generateAvatarSvg({ ...original })).toBe(svg);
    vi.resetModules();
    const reloaded = await import('./avatar');
    expect(reloaded.generateAvatarSvg(original)).toBe(svg);
    expect(reloaded.generateAvatarDataUri(original)).toBe(generateAvatarDataUri(original));
  });

  it('varies colors without changing anatomy and freezes exported palette data', () => {
    const svgs = palettes.map((palette) => generateAvatarSvg({ ...original, palette }));
    expect(new Set(svgs).size).toBe(5);
    for (const palette of palettes) {
      const svg = generateAvatarSvg({ ...original, palette });
      expect(svg).toContain(`#${AVATAR_PALETTES[palette].body}`);
      expect(svg).toContain(`#${AVATAR_PALETTES[palette].accent}`);
      expect(svg).toContain('#20231e');
      expect(svg).toContain('#f3f3e9');
      expect(Object.isFrozen(AVATAR_PALETTES[palette])).toBe(true);
    }
    const normalized = svgs.map((svg) => withoutIds(svg).replace(/#[0-9a-f]{6}/g, '#color'));
    expect(new Set(normalized).size).toBe(1);
    expect(Object.isFrozen(AVATAR_PALETTES)).toBe(true);
  });

  it('returns only encoded local image URIs with unmodified license metadata', () => {
    const uri = generateAvatarDataUri(original);
    const prefix = 'data:image/svg+xml;charset=utf-8,';
    expect(uri.startsWith(prefix)).toBe(true);
    expect(uri).not.toContain('<');
    expect(decodeURIComponent(uri.slice(prefix.length))).toBe(generateAvatarSvg(original));
    expect(generateAvatarSvg(original)).toContain('<dc:creator>DiceBear</dc:creator>');
    expect(generateAvatarSvg(original)).toContain('https://creativecommons.org/publicdomain/zero/1.0/');
  });

  it('reuses descriptor-keyed renders and evicts a bounded cache without appearance changes', () => {
    const base = { ...original, seed: 'f'.repeat(32) };
    const toString = vi.spyOn(DiceBearAvatar.prototype, 'toString');
    const svg = generateAvatarSvg(base);
    generateAvatarDataUri({ ...base });
    generateAvatarSvg({ ...base });
    expect(toString).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 257; i += 1) generateAvatarSvg({ ...base, seed: i.toString(16).padStart(32, '0') });
    const beforeEvictedRender = toString.mock.calls.length;
    expect(generateAvatarSvg(base)).toBe(svg);
    expect(toString).toHaveBeenCalledTimes(beforeEvictedRender + 1);
  });

  it('keeps a varied corpus static and self-contained, with intact eyes and mouths', () => {
    const bodies = new Set<string>();
    const tops = new Set<string>();
    const eyes = new Set<string>();
    const mouths = new Set<string>();
    for (let i = 0; i < 256; i += 1) {
      const palette = palettes[i % palettes.length];
      if (!palette) throw new Error('Missing test palette');
      const svg = generateAvatarSvg({ version: 1, seed: i.toString(16).padStart(32, '0'), palette });
      expect(svg).toMatch(/^<svg .*viewBox="0 0 100 100"/);
      expect(svg).not.toMatch(/<(?:script|foreignObject|animate\w*|set|image|iframe|audio|video|style|linearGradient|radialGradient)\b/i);
      expect(svg).not.toMatch(/\son\w+=|javascript:|(?:xlink:)?href="(?!#)|url\((?!#)/i);
      const ids = Array.from(svg.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
      expect(ids.length).toBeGreaterThan(4);
      expect(new Set(ids).size).toBe(ids.length);
      for (const reference of svg.matchAll(/(?:href="#|url\(#)([^")]+)/g)) expect(ids).toContain(reference[1]);
      for (const [component, variants] of [['body', bodies], ['top', tops], ['eyes', eyes], ['mouth', mouths]] as const) {
        const variant = svg.match(new RegExp(`id="${component}-([a-zA-Z]+)-`))?.[1];
        expect(variant).toBeDefined();
        if (variant) variants.add(variant);
      }
    }
    expect([...bodies].sort()).toEqual(['blob', 'dome', 'round', 'squat']);
    expect([...tops].sort()).toEqual(['earsDroop', 'earsPointy', 'earsRound', 'nub']);
    expect([...eyes].sort()).toEqual(['bigPupils', 'happy', 'round', 'wide']);
    expect([...mouths].sort()).toEqual(['catMouth', 'grin', 'smile']);
  });
});

describe('bounded chooser candidates', () => {
  it('keeps the initial choice first and normally produces six visibly different faces', () => {
    for (const palette of palettes) {
      const value = { ...original, palette };
      const candidates = createAvatarCandidates(value);
      expect(candidates).toHaveLength(6);
      expect(candidates[0]).toEqual(value);
      expect(candidates[0]).not.toBe(value);
      expect(candidates.every(isAvatarDescriptor)).toBe(true);
      expect(candidates.every((candidate) => candidate.palette === palette)).toBe(true);
      expect(new Set(candidates.map((candidate) => candidate.seed)).size).toBe(6);
      expect(new Set(candidates.map((candidate) => withoutIds(generateAvatarSvg(candidate)))).size).toBe(6);
    }
  });

  it('allows distinct seeds with matching appearances after bounded deduplication attempts', () => {
    vi.spyOn(DiceBearAvatar.prototype, 'toJSON').mockReturnValue({ svg: '', options: {} });
    const random = vi.spyOn(crypto, 'getRandomValues');
    const value = createAvatarDescriptor();
    const candidates = createAvatarCandidates(value);
    expect(candidates).toHaveLength(6);
    expect(new Set(candidates.map((candidate) => candidate.seed)).size).toBe(6);
    expect(random).toHaveBeenCalledTimes(61);
  });

  it('does not hang or invent identity-derived seeds when randomness repeatedly collides', () => {
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      if (!(array instanceof Uint8Array)) throw new Error('Expected bytes');
      array.fill(0);
      return array;
    });
    expect(() => createAvatarCandidates({ ...original, seed: '0'.repeat(32) })).toThrow('Could not create six different avatar choices');
    expect(random).toHaveBeenCalledTimes(60);
  });
});
