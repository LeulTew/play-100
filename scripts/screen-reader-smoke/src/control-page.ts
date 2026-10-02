/**
 * Minimal native-dialog control pages. They run through the same reader harness and assertions as journey (a), so a
 * doubled announcement can be attributed either to the app's accessibility tree or to Chromium and the reader alone.
 */

export const SUITES = ['product', 'control'] as const;
export type Suite = (typeof SUITES)[number];

export function parseSuite(value: string | undefined): Suite {
  const suite = (value ?? '').trim() || 'product';
  if (!(SUITES as readonly string[]).includes(suite)) {
    throw new Error(`SR_SUITE must be one of ${SUITES.join(', ')}; got "${suite}"`);
  }
  return suite as Suite;
}

export interface ControlVariant {
  id: string;
  /** Point aria-describedby at the short position line. */
  describedBy: boolean;
  /** Which element carries autofocus when the dialog opens. */
  autofocus: 'heading' | 'close';
}

export const CONTROL_VARIANTS: readonly ControlVariant[] = [
  { id: 'control-heading-describedby', describedBy: true, autofocus: 'heading' },
  { id: 'control-heading-plain', describedBy: false, autofocus: 'heading' },
  { id: 'control-close-describedby', describedBy: true, autofocus: 'close' },
];

export const CONTROL_TITLE = 'Control Game';
export const CONTROL_OPENER = 'Open Control Game';
export const CONTROL_DESCRIPTION = 'Number 01 in the collection.';
export const CONTROL_RATIONALE =
  'A plain native dialog used as a control, with no application code beyond opening and closing it on demand.';

export function controlPath(variant: ControlVariant): string {
  return `/__sr-control/${variant.id}`;
}

/** The control page: one link opens a native modal dialog with showModal; Escape closes it natively. */
export function controlPage(variant: ControlVariant): string {
  const describedBy = variant.describedBy ? ' aria-describedby="control-description"' : '';
  const headingFocus = variant.autofocus === 'heading' ? ' autofocus' : '';
  const closeFocus = variant.autofocus === 'close' ? ' autofocus' : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Native dialog control (${variant.id})</title>
</head>
<body>
<main>
<h1>Native dialog control</h1>
<ul>
<li><a id="opener" href="#control-dialog">${CONTROL_OPENER}</a></li>
</ul>
<dialog id="control-dialog" aria-labelledby="control-title"${describedBy}>
<h2 id="control-title" tabindex="-1"${headingFocus}>${CONTROL_TITLE}</h2>
<p id="control-description">${CONTROL_DESCRIPTION}</p>
<p>Core 50, 2018, Example Studio.</p>
<p class="rationale">${CONTROL_RATIONALE}</p>
<button type="button" id="control-close"${closeFocus}>Close</button>
</dialog>
</main>
<script>
const opener = document.getElementById('opener');
const dialog = document.getElementById('control-dialog');
opener.addEventListener('click', (event) => {
  event.preventDefault();
  dialog.showModal();
});
document.getElementById('control-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  if (document.activeElement === document.body) opener.focus();
});
</script>
</body>
</html>
`;
}
