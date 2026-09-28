import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../lib/browser-fixture';
import { usePwa } from './usePwa.ts';
import { pwaClientModule } from './deferred-controller.ts';
import { SettingsPanel } from '../components/app/SettingsPanel.tsx';
import { emptyPersonalLibrary } from '../lib/personal-library.ts';
window.requestIdleCallback = () => 1;
window.cancelIdleCallback = () => {};
let loads = 0;
const held = new Promise<void>((resolve) => {
  window.releasePwaControls = resolve;
});
const actualLoad = pwaClientModule.load;
pwaClientModule.load = () => {
  loads++;
  return held.then(actualLoad);
};
window.pwaControlLoads = () => loads;
export function Harness() {
  const [settings, showSettings] = useState(false);
  const pwa = usePwa({ enabled: true, wantControls: settings });
  return h(
    'main',
    null,
    h('button', { onClick: () => showSettings(true) }, 'Open Settings directly'),
    settings &&
      h(SettingsPanel, {
        settings: {
          motion: 'auto',
          reducedMotion: true,
          constrained: false,
          saved: 0,
          completed: 0,
          warning: null,
          onMotion: async () => true,
          onReset: async () => true,
          state: emptyPersonalLibrary(),
          persistent: true,
          busy: false,
          onRestore: async () => true,
          onAbout() {},
          onClose: () => showSettings(false),
        },
        offline: { pwa, open: true, onUpdate: async () => false },
      }),
  );
}
createRoot(fixtureElement('root')).render(h(Harness));
