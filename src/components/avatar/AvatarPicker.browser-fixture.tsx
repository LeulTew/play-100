import { createElement as h, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../../lib/browser-fixture';
import type { AvatarDescriptor } from '../../lib/avatar';
import { AvatarPicker } from './AvatarPicker.tsx';
import '../../styles.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
let value: AvatarDescriptor = { version: 1, seed: '00000000000000000000000000000000', palette: 'lime' };
let identityKey = 'fixture-a';
let mode = 'success';
const pending: { resolve(): void; reject(reason: Error): void }[] = [];
const root = createRoot(fixtureElement('mount'));
function render() {
  const identity = identityKey;
  root.render(
    h(
      StrictMode,
      null,
      h(AvatarPicker, {
        value,
        identityKey,
        titleId: 'fixture-title',
        onCancel() {
          window.avatarTest.cancelCalls += 1;
        },
        onSave(next) {
          window.avatarTest.calls.push({ identityKey: identity, descriptor: structuredClone(next) });
          if (mode === 'throw') throw new Error('Synthetic synchronous failure.');
          if (mode === 'failure') return Promise.reject(new Error('Synthetic save failure.'));
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the fixture proves non-Error failures are handled.
          if (mode === 'opaque') return Promise.reject({ code: 'synthetic-non-error' });
          if (mode === 'deferred') return new Promise((resolve, reject) => pending.push({ resolve, reject }));
          return Promise.resolve();
        },
      }),
    ),
  );
}
window.avatarTest = {
  calls: [],
  cancelCalls: 0,
  props(next) {
    value = next.value ?? value;
    identityKey = next.identityKey ?? identityKey;
    render();
  },
  mode(next) {
    mode = next;
  },
  resolve(index) {
    const save = pending[index];
    if (!save) throw new Error('Pending avatar save is missing.');
    save.resolve();
  },
  reject(index) {
    const save = pending[index];
    if (!save) throw new Error('Pending avatar save is missing.');
    save.reject(new Error('Synthetic old-identity failure.'));
  },
  unmount() {
    root.render(null);
  },
  mount() {
    render();
  },
};
render();
