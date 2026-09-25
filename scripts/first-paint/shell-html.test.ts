import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NOTICE_OPEN,
  ROOT_OPEN,
  SHELL_OPEN,
  STYLESHEET_MARKER,
  bootNotice,
  normalizeShellWhitespace,
  selectShellVariant,
  shellMarkup,
  shellText,
} from './shell-html.ts';

const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const wrap = (region: string) => `<head></head><body>${ROOT_OPEN}${region}</div>${STYLESHEET_MARKER}</body>`;

describe('shell comment removal', () => {
  it('matches the previous regex on the committed shell, for both variants', () => {
    for (const variant of ['online', 'offline'] as const) {
      const selected = selectShellVariant(indexHtml, variant);
      const start = selected.indexOf(ROOT_OPEN);
      const end = selected.indexOf(STYLESHEET_MARKER);
      const reference =
        selected.slice(0, start) +
        selected
          .slice(start, end)
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/>\s*\n\s*</g, '><') +
        selected.slice(end);
      expect(normalizeShellWhitespace(selected)).toBe(reference);
    }
  });

  it('ends comments where the HTML tokenizer does', () => {
    expect(normalizeShellWhitespace(wrap('<p>a<!-- x -->b<!-- y --!>c<!-->d<!--->e</p>'))).toBe(wrap('<p>abcde</p>'));
    expect(normalizeShellWhitespace(`<!-- outside -->${wrap('<i>x</i>')}`)).toBe(`<!-- outside -->${wrap('<i>x</i>')}`);
  });

  it('fails closed on an unterminated or reassembled comment', () => {
    expect(() => normalizeShellWhitespace(wrap('<p>a<!-- open</p>'))).toThrow('unterminated comment');
    expect(() => normalizeShellWhitespace(wrap('<p><!<!---->--x--></p>'))).toThrow('left a comment opening behind');
  });
});

describe('shell text', () => {
  it('matches the previous tag regex on the committed shell, for both variants', () => {
    for (const variant of ['online', 'offline'] as const) {
      const markup = shellMarkup(indexHtml, variant);
      expect(shellText(markup)).toBe(shellText(markup.replace(/<[^>]*>/g, '')));
    }
  });

  it('drops each tag from < to the next >, keeping text and a trailing unclosed <', () => {
    expect(shellText('<A HREF="/x" title=\'y\'>Go</A> <svg><path d="M0 0"/></svg>&amp; 1 < 2')).toBe('Go & 1 < 2');
    expect(shellText('<b>x</b\t\n>y')).toBe('xy');
  });
});

describe('failure notice', () => {
  it('is the last child of #root, once, after the shell', () => {
    for (const variant of ['online', 'offline'] as const) {
      const markup = shellMarkup(indexHtml, variant);
      expect(markup.endsWith(`</div>${bootNotice(markup)}</div>`)).toBe(true);
    }
    const shell = `${ROOT_OPEN}${SHELL_OPEN}<p>Shell</p></div>`;
    const notice = `${NOTICE_OPEN}<p>Notice</p></main>`;
    expect(bootNotice(`${shell}${notice}</div>`)).toBe(notice);
    for (const markup of [
      `${shell}</div>`,
      `${shell}${notice}<p>Later</p></div>`,
      `${shell}${notice}${notice}</div>`,
      `${ROOT_OPEN}${notice}${SHELL_OPEN}</div></div>`,
    ]) {
      expect(() => bootNotice(markup), markup).toThrow('#root must end with one failure notice');
    }
  });
});
