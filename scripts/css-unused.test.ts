import { describe, expect, it } from 'vitest';
import { findUnusedRules } from './css-unused';

const scan = (css: string, text = '') =>
  findUnusedRules([{ file: 'src/example.css', text: css }], [{ file: 'src/example.tsx', text }]);

describe('conservative CSS unused-rule candidates', () => {
  it('finds absent classes and ids with source line numbers, including media rules', () => {
    const rules = scan(
      '/* heading */\n.dead {color:red}\n@media (width < 600px) {\n  #gone > .live {color:blue}\n}',
      '"live"',
    );
    expect(rules.map(({ line, missing }) => ({ line, missing }))).toEqual([
      { line: 2, missing: ['dead'] },
      { line: 4, missing: ['gone'] },
    ]);
  });

  it('recognizes decoded string escapes and dynamic prefixes without punctuation', () => {
    expect(scan('.foo{} .panelOpen{}', "const a = '\\u0066oo'; const b = `panel${state}`;")).toEqual([]);
  });

  it('keeps tokens anywhere in source strings, JSX, classList, joins, fixtures and comments', () => {
    expect(
      scan(
        '.jsx{} .imperative{} .joined{} .fixture{} .comment{} #heading{}',
        `const view = <div className="jsx" id="heading" />;
         node.classList.add('imperative'); ['joined', value].join(' ');
         const fixture = '<div class="fixture">'; // comment`,
      ),
    ).toEqual([]);
  });

  it('keeps dynamic template and concatenation families instead of flagging their concrete variants', () => {
    expect(
      scan(
        '.jacket-0{} .sync-error{} .is-open{} .card-selected{}',
        "const a = `jacket-${variant}`; const b = 'sync-' + state; const c = ['is-', state].join(''); const d = `${kind}-selected`;",
      ),
    ).toEqual([]);
  });

  it('never removes attribute selectors, functional pseudos, escaped selectors or nested rules', () => {
    expect(
      scan(
        '.absent[data-open]{} [data-state="x"] .gone{} .live:not(.missing){} :is(.gone, .live){} .escaped\\:name{} .parent { & .child {} }',
      ),
    ).toEqual([]);
  });

  it('keeps a comma group with a live branch but reports one whose every branch requires an absent token', () => {
    expect(scan('.missing, .live {}', '"live"')).toEqual([]);
    expect(scan('.missing:hover, #gone > button {}')[0]?.missing).toEqual(['missing', 'gone']);
  });

  it('ignores declaration values, comments, keyframes and root selectors', () => {
    expect(
      scan(
        '/* .comment {} */ :root{--color:#abcdef} html .absent{} body .gone{} #root .missing{} .live{content:".fake { }"; color:#123abc; background:url(image.webp)} @keyframes pulse{from{opacity:0}to{opacity:1}}',
        '"live"',
      ),
    ).toEqual([]);
  });

  it('treats HTML and first-paint literals as usage and never reports the shell stylesheet', () => {
    expect(
      findUnusedRules(
        [
          { file: 'src\\first-paint\\shell.css', text: '.not-referenced{}' },
          { file: 'src/example.css', text: '.shell{} #notice{} .fallback{}' },
        ],
        [
          { file: 'index.html', text: '<div class="shell" id="notice">' },
          { file: 'src/first-paint/shell.css', text: '.fallback { display: none }' },
        ],
      ),
    ).toEqual([]);
  });

  it.each(['.broken {', '.broken {} }'])('fails explicitly on unbalanced CSS: %s', (css) => {
    expect(() => scan(css)).toThrow('Unbalanced CSS');
  });
});
