import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../lib/browser-fixture';
import type { AppPanel } from '../lib/secondary-dialogs';
import { useAppPanel } from './useAppPanel.ts';
import { aboutDialogModule, settingsDialogModule } from '../lib/secondary-dialogs.ts';
declare global {
  interface Window {
    waitForSettings(): Promise<void>;
    waitForAbout(): Promise<void>;
  }
}
window.waitForSettings = async () => {
  await settingsDialogModule.load();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};
window.waitForAbout = async () => {
  await aboutDialogModule.load();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};
window.requestIdleCallback = () => 1;
window.cancelIdleCallback = () => {};
let scope = 'guest',
  opening = !new URLSearchParams(location.search).has('settled');
const root = createRoot(fixtureElement('root'));
export function Harness() {
  const result = useAppPanel(scope, opening);
  return (
    <main>
      <output id="panel">{result.panel || 'none'}</output>
      <output id="message">{result.panelMessage}</output>
      <output id="message-state">
        {JSON.stringify({ text: result.panelMessage, error: result.panelMessageError })}
      </output>
      <output id="opening">{String(opening)}</output>
      <output id="failure">{result.panelFailure || 'none'}</output>
      {(['menu', 'about', 'settings', null] satisfies AppPanel[]).map((panel) => (
        <button key={panel || 'close'} onClick={() => result.setPanel(panel)}>
          {panel || 'close'}
        </button>
      ))}
      <button
        onClick={() => {
          scope = scope === 'account:two' ? 'account:three' : 'account:two';
          render();
        }}
      >
        scope
      </button>
      <button
        onClick={() => {
          opening = !opening;
          render();
        }}
      >
        opening
      </button>
      <button onClick={() => window.dispatchEvent(new Event('play100:navigate'))}>navigate</button>
      <button onClick={() => window.dispatchEvent(new Event('popstate'))}>popstate</button>
      <button onClick={result.dismissPanelMessage}>dismiss</button>
    </main>
  );
}
function render() {
  root.render(<Harness />);
}
render();
