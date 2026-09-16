import { Avatar as DiceBearAvatar, Style } from '@dicebear/core';
import type { StyleOptions } from '@dicebear/core';
import definition from '@dicebear/styles/critters.json' with { type: 'json' };

export type AvatarPalette = 'lime' | 'moss' | 'clay' | 'sky' | 'lilac';

export interface AvatarDescriptor {
  version: 1;
  seed: string;
  palette: AvatarPalette;
}

export const AVATAR_PALETTES = Object.freeze({
  lime: Object.freeze({ label: 'Lime', body: 'd3f36b', accent: 'b6ce68' }),
  moss: Object.freeze({ label: 'Moss', body: '8fa38f', accent: '6f856f' }),
  clay: Object.freeze({ label: 'Clay', body: 'd9bd94', accent: 'a8865a' }),
  sky: Object.freeze({ label: 'Sky', body: 'a9bfd7', accent: '879fb8' }),
  lilac: Object.freeze({ label: 'Lilac', body: 'b5a6c4', accent: '9383a9' }),
} satisfies Record<AvatarPalette, { label: string; body: string; accent: string }>);

const style = new Style(definition);

// Version 1 is an appearance contract, including dependency versions and array order.
// Keep this recipe available for saved v1 descriptors when adding a future version.
const recipeV1 = {
  idRandomization: false,
  flip: 'none',
  rotate: 0,
  scale: 1,
  translateX: 0,
  translateY: 0,
  borderRadius: 0,
  topVariant: ['earsRound', 'earsDroop', 'earsPointy', 'nub'],
  topProbability: 100,
  bodyVariant: ['round', 'squat', 'dome', 'blob'],
  bodyProbability: 100,
  eyesVariant: ['round', 'wide', 'happy', 'bigPupils'],
  eyesProbability: 100,
  mouthVariant: ['smile', 'catMouth', 'grin'],
  mouthProbability: 100,
  patternVariant: ['belly', 'spot'],
  patternProbability: 25,
  cheeksVariant: ['blush'],
  cheeksProbability: 15,
  animationVariant: 'none',
  animationProbability: 0,
  tags: [],
  inkColor: ['20231e'],
  backgroundColor: ['f3f3e9'],
  backgroundColorFill: 'solid',
  bodyColorFill: 'solid',
  accentColorFill: 'solid',
  inkColorFill: 'solid',
} as const satisfies StyleOptions<typeof definition>;

interface RenderedAvatar {
  svg: string;
  dataUri: string;
  appearance: string;
}

const renderCache = new Map<string, RenderedAvatar>();
const cacheLimit = 256;
const candidateCount = 6;
const candidateAttemptLimit = 60;

export function isAvatarPalette(value: unknown): value is AvatarPalette {
  return typeof value === 'string' && Object.hasOwn(AVATAR_PALETTES, value);
}

export function isAvatarDescriptor(value: unknown): value is AvatarDescriptor {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 3 || !keys.every((key) => {
    if (key !== 'version' && key !== 'seed' && key !== 'palette') return false;
    const property = Object.getOwnPropertyDescriptor(value, key);
    return property?.enumerable === true && 'value' in property;
  })) return false;
  return 'version' in value && value.version === 1 &&
    'seed' in value && typeof value.seed === 'string' && value.seed.length === 32 && /^[0-9a-f]{32}$/.test(value.seed) &&
    'palette' in value && isAvatarPalette(value.palette);
}

/** Validates decoded metadata, returning a copy. Does not repair or replace bad data. */
export function parseAvatarDescriptor(value: unknown): AvatarDescriptor {
  if (!isAvatarDescriptor(value)) {
    throw new TypeError('Invalid avatar descriptor: expected only version 1, a 32-character lowercase hex seed, and a supported palette.');
  }
  return { version: 1, seed: value.seed, palette: value.palette };
}

/** Uses 128 random bits, never account identifiers or Math.random(). */
export function createAvatarDescriptor(palette: AvatarPalette = 'lime'): AvatarDescriptor {
  if (!isAvatarPalette(palette)) throw new TypeError('Unsupported avatar palette.');
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure randomness is unavailable. Open Play 100 in a secure browser context to create avatars.');
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return { version: 1, seed: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''), palette };
}

function renderAvatar(value: AvatarDescriptor): RenderedAvatar {
  const descriptor = parseAvatarDescriptor(value);
  const key = `${descriptor.version}:${descriptor.seed}:${descriptor.palette}`;
  const cached = renderCache.get(key);
  if (cached) {
    renderCache.delete(key);
    renderCache.set(key, cached);
    return cached;
  }
  const palette = AVATAR_PALETTES[descriptor.palette];
  const avatar = new DiceBearAvatar(style, {
    ...recipeV1,
    seed: descriptor.seed,
    bodyColor: [palette.body],
    accentColor: [palette.accent],
  });
  const rendered = {
    svg: avatar.toString(),
    dataUri: avatar.toDataUri(),
    // Resolved options omit the seed and ID suffix, so identical faces compare equal.
    appearance: JSON.stringify(avatar.toJSON().options),
  };
  if (renderCache.size >= cacheLimit) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  renderCache.set(key, rendered);
  return rendered;
}

/** Trusted local SVG only. Use in an img, not inline: deterministic IDs are image-scoped. */
export function generateAvatarSvg(descriptor: AvatarDescriptor): string {
  return renderAvatar(descriptor).svg;
}

export function generateAvatarDataUri(descriptor: AvatarDescriptor): string {
  return renderAvatar(descriptor).dataUri;
}

/** Six choices including the supplied face first; bounded, best-effort visual deduplication. */
export function createAvatarCandidates(value: AvatarDescriptor): AvatarDescriptor[] {
  const selected = parseAvatarDescriptor(value);
  const candidates = [selected];
  const appearances = new Set([renderAvatar(selected).appearance]);
  const seeds = new Set([selected.seed]);
  const similar: AvatarDescriptor[] = [];
  for (let attempt = 0; attempt < candidateAttemptLimit && candidates.length < candidateCount; attempt += 1) {
    const next = createAvatarDescriptor(selected.palette);
    if (seeds.has(next.seed)) continue;
    seeds.add(next.seed);
    const appearance = renderAvatar(next).appearance;
    if (appearances.has(appearance)) {
      similar.push(next);
    } else {
      appearances.add(appearance);
      candidates.push(next);
    }
  }
  candidates.push(...similar.slice(0, candidateCount - candidates.length));
  if (candidates.length !== candidateCount) {
    throw new Error('Could not create six different avatar choices. Try Shuffle again.');
  }
  return candidates;
}
