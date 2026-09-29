import { createElement as h, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../lib/browser-fixture';
import type { MotionPreference } from '../lib/types';
import { SettingsDialog } from './SettingsDialog.tsx';
import { emptyPersonalLibrary } from '../lib/personal-library.ts';
import '../styles.css';
import '../shared-ui.css';
let finish: (result: boolean | 'reject') => void;
let finishRestore: (result: boolean | 'reject') => void;
let finishReset: (result: boolean | 'reject') => void;
let deferReset = false;
let setExternalBusy: (value: boolean) => void;
let setPersistent: (value: boolean) => void;
let saved = 'auto',
  inFlight = 0,
  maxInFlight = 0,
  frameGeneration = 0;
const calls: string[] = [];
const frames: Window['settingsRadioFixture']['frames'] = [];
export function App() {
  const [open, setOpen] = useState(true);
  const [motion, setMotion] = useState<MotionPreference>('auto');
  const [busy, setBusy] = useState(false);
  const [persistent, updatePersistent] = useState(true);
  useLayoutEffect(() => {
    setPersistent = updatePersistent;
    setExternalBusy = setBusy;
  }, []);
  if (!open) return <button id="after-settings">Continue browsing</button>;
  return (
    <SettingsDialog
      motion={motion}
      busy={busy}
      reducedMotion={false}
      constrained={false}
      saved={0}
      completed={0}
      warning={null}
      state={{ ...emptyPersonalLibrary(), motion }}
      persistent={persistent}
      status="Existing Settings status."
      onMotion={(value) => {
        calls.push(value);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        setBusy(true);
        return new Promise((resolve, reject) => {
          finish = (result) => {
            inFlight -= 1;
            if (result === true) {
              saved = value;
              setMotion(value);
            }
            setBusy(false);
            if (result === 'reject') reject(new Error('Synthetic motion-save rejection'));
            else resolve(result);
          };
        });
      }}
      onReset={() => {
        window.settingsRadioFixture.resetCalls += 1;
        if (!deferReset) return Promise.resolve(true);
        setBusy(true);
        return new Promise((resolve, reject) => {
          finishReset = (result) => {
            setBusy(false);
            if (result === 'reject') reject(new Error('Synthetic reset rejection'));
            else resolve(result);
          };
        });
      }}
      onRestore={() => {
        window.settingsRadioFixture.restoreCalls += 1;
        setBusy(true);
        return new Promise((resolve, reject) => {
          finishRestore = (result) => {
            setBusy(false);
            if (result === 'reject') reject(new Error('Synthetic restore rejection'));
            else resolve(result);
          };
        });
      }}
      onAbout={() => {}}
      onClose={() => setOpen(false)}
    />
  );
}
document.addEventListener('change', (event) => {
  if (!(event.target instanceof HTMLInputElement) || event.target.name !== 'visual-experience') return;
  const generation = ++frameGeneration;
  frames.length = 0;
  const sample = () => {
    if (generation !== frameGeneration) return;
    frames.push({
      checked: document.querySelector<HTMLInputElement>('input[name="visual-experience"]:checked')?.value,
      selected: document.querySelector<HTMLInputElement>('.motion-option.selected input')?.value,
      focused: document.activeElement instanceof HTMLInputElement ? document.activeElement.value : undefined,
      disabled: Boolean(document.querySelector('input[name="visual-experience"]:disabled')),
    });
    if (frames.length < 2) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
window.settingsRadioFixture = {
  calls,
  frames,
  finish: (result) => finish(result),
  externalBusy: (value) => setExternalBusy(value),
  saved: () => saved,
  inFlight: () => inFlight,
  maxInFlight: () => maxInFlight,
  temporary: () => setPersistent(false),
  restoreCalls: 0,
  finishRestore: (result) => finishRestore(result),
  resetCalls: 0,
  holdReset: () => {
    deferReset = true;
  },
  finishReset: (result) => finishReset(result),
};
createRoot(fixtureElement('mount')).render(h(App));
