import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NOTICE_OPEN,
  ROOT_OPEN,
  SHELL_OPEN,
  SHELL_PLACEHOLDER,
  STYLESHEET_MARKER,
  bootNotice,
  shellMarkup,
  shellRegion,
  shellText,
  withShell,
} from './shell-html.ts';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** The #root markup a build ships, from the reviewed snapshots that render-shell.test.ts checks against the build. */
function shippedRoot(variant: 'online' | 'offline'): string {
  const shipped = read(`src/first-paint/__snapshots__/index.${variant}.html`);
  const { start, end } = shellRegion(shipped);
  return shipped.slice(start, end);
}
const roots = [shippedRoot('online'), shippedRoot('offline')];
const indexHtml = read('index.html');
const SHELL = `${SHELL_OPEN}<p>Shell</p></div>`;
const NOTICE = `${NOTICE_OPEN}<p>Notice</p></main>`;
const wrap = (region: string) => `<head></head><body>${ROOT_OPEN}${region}</div>${STYLESHEET_MARKER}</body>`;

describe('shell placement', () => {
  it('matches the previous comment and whitespace regexes on index.html', () => {
    const { start, end } = shellRegion(indexHtml);
    const region = indexHtml
      .slice(start, end)
      .replace(SHELL_PLACEHOLDER, () => SHELL)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/>\s*\n\s*</g, '><');
    expect(withShell(indexHtml, SHELL)).toBe(indexHtml.slice(0, start) + region + indexHtml.slice(end));
  });

  it('puts the shell in place of the placeholder and drops the comments and indentation of #root', () => {
    const page = (region: string) =>
      `<!-- head -->\n<head></head>\n<body>\n  ${ROOT_OPEN}${region}</div>${STYLESHEET_MARKER}\n  <p>\n    After</p>\n</body>`;
    expect(withShell(page(`\n    <!-- The shell. -->\n    ${SHELL_PLACEHOLDER}\n    ${NOTICE}\n  `), SHELL)).toBe(
      page(`${SHELL}${NOTICE}`),
    );
  });

  it('keeps the text and the spaces between tags on one line', () => {
    const region = '<p>a b</p> <i>c\n  d</i>';
    expect(withShell(wrap(`${SHELL_PLACEHOLDER}${region}`), SHELL)).toBe(wrap(`${SHELL}${region}`));
  });

  it('inserts the shell verbatim', () => {
    const shell = `${SHELL_OPEN}<p>$& $' $1 $$</p></div>`;
    expect(withShell(wrap(SHELL_PLACEHOLDER), shell)).toBe(wrap(shell));
  });

  it('ends comments where the HTML tokenizer does', () => {
    expect(withShell(wrap(`<p>a<!-- x -->b<!-- y --!>c<!-->d<!--->e</p>${SHELL_PLACEHOLDER}`), SHELL)).toBe(
      wrap(`<p>abcde</p>${SHELL}`),
    );
    expect(withShell(`<!-- outside -->${wrap(SHELL_PLACEHOLDER)}`, SHELL)).toBe(`<!-- outside -->${wrap(SHELL)}`);
  });

  it('fails closed on an unterminated or reassembled comment', () => {
    expect(() => withShell(wrap(`${SHELL_PLACEHOLDER}<p>a<!-- open</p>`), SHELL)).toThrow('unterminated comment');
    // In a browser the placeholder's --> ends this comment, so the placeholder is part of it.
    expect(() => withShell(wrap(`<!-- open ${SHELL_PLACEHOLDER}`), SHELL)).toThrow('unterminated comment');
    expect(() => withShell(wrap(`${SHELL_PLACEHOLDER}<p><!<!---->--x--></p>`), SHELL)).toThrow(
      'left a comment opening behind',
    );
  });

  it('needs exactly one placeholder, in #root and outside every comment', () => {
    for (const html of [
      wrap('<p>x</p>'),
      wrap(SHELL_PLACEHOLDER.repeat(2)),
      `${SHELL_PLACEHOLDER}${wrap('<p>x</p>')}`,
      `${wrap(SHELL_PLACEHOLDER)}${SHELL_PLACEHOLDER}`,
      wrap(`<p100-shell>${SHELL_PLACEHOLDER}`),
    ]) {
      expect(() => withShell(html, SHELL), html).toThrow(`exactly one ${SHELL_PLACEHOLDER}, inside #root`);
    }
    expect(() => withShell(wrap(`<!-- ${SHELL_PLACEHOLDER} -->`), SHELL)).toThrow('must stand outside every comment');
  });

  it('takes only a rendered shell without comments', () => {
    for (const shell of [
      '<div class="first-paint-shell" hidden><p>x</p></div>',
      `<p>x</p>${SHELL}`,
      `${SHELL_OPEN}<!-- x --></div>`,
      `${SHELL_OPEN}<p100-shell></div>`,
    ]) {
      expect(() => withShell(wrap(SHELL_PLACEHOLDER), shell), shell).toThrow(
        `must start with ${SHELL_OPEN} and hold no comments`,
      );
    }
  });

  it('starts #root with the shell', () => {
    expect(shellMarkup(wrap(`${SHELL_PLACEHOLDER}${NOTICE}`), SHELL)).toBe(`${ROOT_OPEN}${SHELL}${NOTICE}</div>`);
    expect(() => shellMarkup(wrap(`<p>x</p>${SHELL_PLACEHOLDER}`), SHELL)).toThrow(
      `#root must start with ${SHELL_OPEN}`,
    );
  });
});

describe('shell text', () => {
  it('matches the previous tag regex on the shipped shells', () => {
    for (const markup of roots) expect(shellText(markup)).toBe(shellText(markup.replace(/<[^>]*>/g, '')));
  });

  it('drops each tag from < to the next >, keeping text and a trailing unclosed <', () => {
    expect(shellText('<A HREF="/x" title=\'y\'>Go</A> <svg><path d="M0 0"/></svg>&amp; 1 < 2')).toBe('Go & 1 < 2');
    expect(shellText('<b>x</b\t\n>y')).toBe('xy');
  });
});

describe('failure notice', () => {
  it('is the last child of #root, once, after the shell', () => {
    for (const markup of roots) expect(markup.endsWith(`</div>${bootNotice(markup)}</div>`)).toBe(true);
    const shell = `${ROOT_OPEN}${SHELL}`;
    expect(bootNotice(`${shell}${NOTICE}</div>`)).toBe(NOTICE);
    for (const markup of [
      `${shell}</div>`,
      `${shell}${NOTICE}<p>Later</p></div>`,
      `${shell}${NOTICE}${NOTICE}</div>`,
      `${ROOT_OPEN}${NOTICE}${SHELL_OPEN}</div></div>`,
    ]) {
      expect(() => bootNotice(markup), markup).toThrow('#root must end with one failure notice');
    }
  });
});
