import React from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../../lib/browser-fixture';
import type { MotionPreference } from '../../lib/types';
import CountUp from './CountUp.tsx';
import { useCapabilities } from '../../hooks/useCapabilities.ts';
const nativeFrame = requestAnimationFrame.bind(window);
const nativeCancel = cancelAnimationFrame.bind(window);
const pending = new Set();
let requested = 0,
  canceled = 0;
window.requestAnimationFrame = (callback) => {
  requested += 1;
  const id = nativeFrame((time) => {
    pending.delete(id);
    callback(time);
  });
  pending.add(id);
  return id;
};
window.cancelAnimationFrame = (id) => {
  canceled += 1;
  pending.delete(id);
  nativeCancel(id);
};
const container = fixtureElement('root');
const root = createRoot(container);
let controls: { to: number; preference: MotionPreference; scope: string } = {
  to: 42,
  preference: 'full',
  scope: 'guest',
};
export function Fixture() {
  const policy = useCapabilities(controls.preference);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'label',
      null,
      'Retained field',
      React.createElement('input', { 'aria-label': 'Retained field', defaultValue: '' }),
    ),
    React.createElement(CountUp, {
      key: controls.scope,
      to: controls.to,
      animate: policy.animate,
      className: 'saved-count',
    }),
  );
}
function render() {
  root.render(React.createElement(React.StrictMode, null, React.createElement(Fixture)));
}
window.counterFixture = {
  set(patch) {
    controls = { ...controls, ...patch };
    render();
  },
  destroy() {
    root.unmount();
  },
  detach() {
    container.remove();
  },
  frames(count) {
    return new Promise((resolve) => {
      const next = () => {
        if (--count <= 0) resolve();
        else nativeFrame(next);
      };
      nativeFrame(next);
    });
  },
  stats() {
    return { pending: pending.size, requested, canceled };
  },
};
render();
