/** Pure helpers for reading a screen reader's spoken phrase log. No I/O lives here, so every rule is unit-tested. */

export const PRODUCTION_ORIGIN = 'https://play-100-collection.vercel.app';

/**
 * Accepts only a bare HTTPS origin, or plain HTTP on the 127.0.0.1 loopback where the workflow serves a build of a
 * requested commit, so a typo can't point the readers at an unexpected path or scheme.
 */
export function validateOrigin(value: string | undefined): string {
  const raw = (value ?? '').trim() || PRODUCTION_ORIGIN;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`target_origin is not a URL: ${raw}`);
  }
  const loopback = url.protocol === 'http:' && url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !loopback)
    throw new Error(`target_origin must use https, or http on 127.0.0.1: ${raw}`);
  if (url.username || url.password) throw new Error('target_origin must not carry credentials');
  if (url.pathname !== '/' || url.search || url.hash || raw.replace(/\/$/, '').toLowerCase() !== url.origin)
    throw new Error(`target_origin must be a bare origin without a path, query or fragment: ${raw}`);
  return url.origin;
}

/** Lower-cases, folds typographic quotes and dashes, and collapses whitespace so spoken text compares reliably. */
export function normalizeSpeech(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Joins phrases into one normalised transcript. Readers split long text into several phrases at sentence breaks. */
export function transcript(phrases: readonly string[]): string {
  return normalizeSpeech(phrases.join(' '));
}

/** Counts non-overlapping occurrences of a needle across the joined phrases. */
export function countSpoken(phrases: readonly string[], needle: string): number {
  const target = normalizeSpeech(needle);
  if (!target) return 0;
  const text = transcript(phrases);
  let count = 0;
  for (let index = text.indexOf(target); index !== -1; index = text.indexOf(target, index + target.length)) count++;
  return count;
}

export function spoke(phrases: readonly string[], needle: string | RegExp): boolean {
  if (typeof needle === 'string') return countSpoken(phrases, needle) > 0;
  return needle.test(transcript(phrases));
}

/**
 * A distinctive leading fragment of a long description. Readers may stop or re-chunk long text, and a doubled
 * description shows up as its opening words spoken twice.
 */
export function descriptionFragment(description: string, words = 8): string {
  return normalizeSpeech(description).split(' ').slice(0, words).join(' ');
}

/**
 * The closing words of a long body text. A reader that reads the whole body on open speaks them; a short description
 * or the dialog's name and heading do not.
 */
export function bodyTail(text: string, words = 8): string {
  return normalizeSpeech(text).split(' ').filter(Boolean).slice(-words).join(' ');
}

/** Counts whole-word occurrences of a word, for example how many times "dialog" was announced. */
export function countWord(phrases: readonly string[], word: string): number {
  const pattern = new RegExp(`\\b${escapeRegExp(normalizeSpeech(word))}\\b`, 'g');
  return transcript(phrases).match(pattern)?.length ?? 0;
}

export function expectAtMost(name: string, phrases: readonly string[], word: string, most: number): Assertion {
  const count = countWord(phrases, word);
  return { name, pass: count <= most, detail: `heard "${word}" ${count} time(s), at most ${most}` };
}

export function expectNotSpoken(name: string, phrases: readonly string[], needle: string): Assertion {
  const count = countSpoken(phrases, needle);
  return {
    name,
    pass: Boolean(normalizeSpeech(needle)) && count === 0,
    detail: `heard "${normalizeSpeech(needle)}" ${count} time(s), expected 0`,
  };
}

/** Discover's search status, for example "1 catalog match shown" or "12 catalog matches shown". */
export const RESULT_COUNT = /\b\d[\d,]* catalog match(?:es)? shown\b/;

/** The compare tray's confirmation after a pin, for example "Portal 2 pinned for comparison. 1 of 6 games." */
export function pinConfirmation(title: string): RegExp {
  return new RegExp(`${escapeRegExp(normalizeSpeech(title))} pinned for comparison\\.? \\d of 6 games`);
}

/** The tray's own control, for example "1 game in Compare tray" or "2 games in Temporary tray". */
export const TRAY_STATE = /\b\d games? in (?:compare|temporary) tray\b/;

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface Assertion {
  name: string;
  pass: boolean;
  detail: string;
}

export function expectSpoken(name: string, phrases: readonly string[], needle: string | RegExp): Assertion {
  const pass = spoke(phrases, needle);
  return { name, pass, detail: `${pass ? 'heard' : 'did not hear'} ${String(needle)}` };
}

export function expectSpokenTimes(
  name: string,
  phrases: readonly string[],
  needle: string,
  expected: number,
): Assertion {
  const count = countSpoken(phrases, needle);
  return {
    name,
    pass: count === expected,
    detail: `heard "${normalizeSpeech(needle)}" ${count} time(s), expected ${expected}`,
  };
}

export function expectTrue(name: string, pass: boolean, detail: string): Assertion {
  return { name, pass, detail };
}

export interface JournalStep {
  label: string;
  keys: string[];
  spoken: string[];
  observed?: unknown;
  at: string;
}

/** Records the phrase log in labelled steps, so a journey's artifact shows what each key press produced. */
export class SpeechJournal {
  readonly steps: JournalStep[] = [];
  readonly assertions: Assertion[] = [];
  error: string | undefined;
  #consumed = 0;

  readonly journey: string;

  constructor(journey: string) {
    this.journey = journey;
  }

  /** Adds the phrases spoken since the previous step. `log` is the reader's full phrase log for this journey. */
  step(label: string, keys: string[], log: readonly string[], observed?: unknown): string[] {
    const spoken = log.slice(this.#consumed);
    this.#consumed = log.length;
    this.steps.push({ label, keys, spoken, observed, at: new Date().toISOString() });
    return spoken;
  }

  check(assertion: Assertion): Assertion {
    this.assertions.push(assertion);
    return assertion;
  }

  get failures(): Assertion[] {
    return this.assertions.filter((assertion) => !assertion.pass);
  }

  get passed(): boolean {
    return !this.error && this.assertions.length > 0 && this.failures.length === 0;
  }

  /** Every phrase recorded from the step with this label onwards. */
  since(label: string): string[] {
    const start = this.steps.findIndex((step) => step.label === label);
    if (start === -1) return [];
    return this.steps.slice(start).flatMap((step) => step.spoken);
  }

  toJSON() {
    return {
      journey: this.journey,
      result: this.passed ? 'pass' : 'fail',
      error: this.error,
      assertions: this.assertions,
      steps: this.steps,
      spokenPhraseLog: this.steps.flatMap((step) => step.spoken),
    };
  }
}

/** Summarises journeys as Markdown table rows for the job summary. */
export function summaryLines(reader: string, journals: readonly SpeechJournal[]): string[] {
  const lines = [`### ${reader}`, '', '| Journey | Result | Failed checks |', '| --- | --- | --- |'];
  for (const journal of journals) {
    const failed = [
      ...(journal.error ? [`error: ${journal.error}`] : []),
      ...journal.failures.map((failure) => `${failure.name}: ${failure.detail}`),
    ].join('; ');
    lines.push(
      `| ${journal.journey} | ${journal.passed ? 'PASS' : 'FAIL'} | ${failed.replace(/\|/g, '\\|').replace(/\n/g, ' ') || '-'} |`,
    );
  }
  return lines;
}
