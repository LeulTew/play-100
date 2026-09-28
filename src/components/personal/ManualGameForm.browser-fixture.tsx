import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../../lib/browser-fixture';
import ManualGameForm from './ManualGameForm.tsx';
import '../../styles.css';
import '../../shared-ui.css';
const added: string[] = [];
const waiting: ((result: boolean | 'reject') => void)[] = [];
window.manualFormFixture = {
  added,
  pending: () => waiting.length,
  finish(result) {
    const next = waiting.shift();
    if (next) next(result);
  },
};
createRoot(fixtureElement('mount')).render(
  h(ManualGameForm, {
    busy: false,
    actionLabel: 'Add to my library',
    onAdd: (record) =>
      new Promise((resolve, reject) => {
        added.push(record.title + '|' + record.year);
        waiting.push((result) =>
          result === 'reject' ? reject(new Error('Synthetic add rejection')) : resolve(result),
        );
      }),
  }),
);
