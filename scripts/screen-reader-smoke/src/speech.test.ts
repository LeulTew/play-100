import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_ORIGIN,
  controlLimits,
  RESULT_COUNT,
  SpeechJournal,
  TRAY_STATE,
  bodyTail,
  countSpoken,
  countWord,
  descriptionFragment,
  expectAtMost,
  expectNotSpoken,
  expectSpokenTimes,
  normalizeSpeech,
  pinConfirmation,
  spoke,
  summaryLines,
  validateOrigin,
} from './speech.ts';

describe('validateOrigin', () => {
  it('defaults to production', () => {
    expect(validateOrigin(undefined)).toBe(PRODUCTION_ORIGIN);
    expect(validateOrigin('  ')).toBe(PRODUCTION_ORIGIN);
  });

  it('accepts a bare https origin with or without a trailing slash', () => {
    expect(validateOrigin('https://candidate.trycloudflare.com/')).toBe('https://candidate.trycloudflare.com');
    expect(validateOrigin('https://Example.test:8443')).toBe('https://example.test:8443');
  });

  it('accepts plain http only on the 127.0.0.1 loopback', () => {
    expect(validateOrigin('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173');
    expect(() => validateOrigin('http://localhost:4173')).toThrow(/https/);
    expect(() => validateOrigin('http://example.test')).toThrow(/https/);
  });

  it.each([
    'http://play-100-collection.vercel.app',
    'https://play-100-collection.vercel.app/discover',
    'https://play-100-collection.vercel.app/?q=1',
    'https://play-100-collection.vercel.app/#x',
    'https://user:pass@example.test',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (value) => {
    expect(() => validateOrigin(value)).toThrow();
  });
});

describe('speech matching', () => {
  it('normalises case, whitespace, quotes and dashes', () => {
    expect(normalizeSpeech('  Tony\u2019s  Rating \u2014 9 ')).toBe("tony's rating - 9");
  });

  it('counts a description split across phrases once', () => {
    const phrases = ['Portal 2', 'dialog', 'A puzzle game about', 'portals and lasers.', 'heading level 2'];
    expect(countSpoken(phrases, 'A puzzle game about portals')).toBe(1);
  });

  it('counts a doubled description twice', () => {
    const phrases = [
      'Portal 2 dialog',
      'A puzzle game about portals.',
      'Portal 2 heading',
      'A puzzle game about portals.',
    ];
    expect(countSpoken(phrases, descriptionFragment('A puzzle game about portals. More text follows here.', 5))).toBe(
      2,
    );
    expect(expectSpokenTimes('description once', phrases, 'a puzzle game about portals', 1).pass).toBe(false);
  });

  it('returns zero for an empty needle', () => {
    expect(countSpoken(['anything'], '  ')).toBe(0);
  });

  it('matches regular expressions against the transcript', () => {
    expect(spoke(['4 catalog matches shown'], RESULT_COUNT)).toBe(true);
    expect(spoke(['1 catalog match shown'], RESULT_COUNT)).toBe(true);
    expect(spoke(['Loading the catalog\u2026'], RESULT_COUNT)).toBe(false);
    expect(spoke(['1 game in Compare tray', 'button'], TRAY_STATE)).toBe(true);
    expect(spoke(['2 games in Temporary tray'], TRAY_STATE)).toBe(true);
  });

  it('builds a pin confirmation that escapes the title', () => {
    expect(
      spoke(
        ['Grand Theft Auto V (2013) pinned for comparison. 1 of 6 games.'],
        pinConfirmation('Grand Theft Auto V (2013)'),
      ),
    ).toBe(true);
    expect(spoke(['Portal pinned for comparison. 1 of 6 games.'], pinConfirmation('Portal 2'))).toBe(false);
  });

  it('takes the leading words of a description', () => {
    expect(descriptionFragment('One two  three four', 3)).toBe('one two three');
  });
});

describe('dialog opening speech', () => {
  const body =
    'The benchmark blockbuster: world-building, immersion, narrative detail and a frontier that keeps going.';
  const tail = bodyTail(body);

  it('takes the closing words of the body', () => {
    expect(tail).toBe(normalizeSpeech('narrative detail and a frontier that keeps going.'));
  });

  it('accepts a name, heading and short description without the full body', () => {
    const opening = ['Red Dead Redemption 2 dialog', 'Open-world western', 'Red Dead Redemption 2 heading level 2'];
    expect(expectNotSpoken('no full body', opening, tail).pass).toBe(true);
    expect(expectAtMost('dialog once', opening, 'dialog', 1).pass).toBe(true);
    expect(expectAtMost('heading once', opening, 'heading', 1).pass).toBe(true);
  });

  it('rejects a full body read and a doubled announcement', () => {
    const opening = ['Red Dead Redemption 2 dialog', body, 'Red Dead Redemption 2 dialog', 'heading level 2'];
    expect(expectNotSpoken('no full body', opening, tail).pass).toBe(false);
    expect(expectAtMost('dialog once', opening, 'dialog', 1).pass).toBe(false);
  });

  it('counts whole words only and never passes an empty needle', () => {
    expect(countWord(['dialogs dialog', 'Dialog'], 'dialog')).toBe(2);
    expect(expectNotSpoken('empty', ['anything'], '').pass).toBe(false);
  });
});

describe('SpeechJournal', () => {
  it('slices the log into steps and reports results', () => {
    const journal = new SpeechJournal('a');
    const log = ['first'];
    expect(journal.step('open', ['Enter'], log)).toEqual(['first']);
    log.push('second', 'third');
    expect(journal.step('close', ['Escape'], log)).toEqual(['second', 'third']);
    expect(journal.since('close')).toEqual(['second', 'third']);
    expect(journal.since('open')).toEqual(['first', 'second', 'third']);
    expect(journal.since('missing')).toEqual([]);
    expect(journal.passed).toBe(false);
    journal.check({ name: 'ok', pass: true, detail: '' });
    expect(journal.passed).toBe(true);
    journal.check({ name: 'bad | pipe', pass: false, detail: 'x' });
    expect(journal.passed).toBe(false);
    expect(journal.toJSON().spokenPhraseLog).toEqual(['first', 'second', 'third']);
    expect(summaryLines('NVDA', [journal]).at(-1)).toBe('| a | FAIL | bad \\| pipe: x |');
  });

  it('fails a journey that threw', () => {
    const journal = new SpeechJournal('b');
    journal.check({ name: 'ok', pass: true, detail: '' });
    journal.error = 'timed out';
    expect(journal.passed).toBe(false);
    expect(summaryLines('NVDA', [journal]).at(-1)).toBe('| b | FAIL | error: timed out |');
  });
});

describe('controlLimits', () => {
  it('counts the native control announcement words', () => {
    const phrases = [
      'Control Game, dialog, Number 01 in the collection.. Control Game, heading, level 2. Control Game, dialog, Number 01 in the collection.. heading, level 2, Control Game',
    ];
    expect(controlLimits(phrases)).toEqual({ dialog: 2, heading: 2 });
  });

  it('yields zero for a silent control so the comparison fails', () => {
    expect(controlLimits([])).toEqual({ dialog: 0, heading: 0 });
    expect(expectAtMost('x', ['Game, dialog'], 'dialog', controlLimits([]).dialog).pass).toBe(false);
  });
});
