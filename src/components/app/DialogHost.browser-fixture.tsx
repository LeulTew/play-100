import { StrictMode, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';
import { ErrorBoundary } from '../ErrorBoundary';
import { fixtureElement } from '../../lib/browser-fixture';
import '../../styles.css';
import '../../shared-ui.css';

export function Harness() {
  const [revision, setRevision] = useState(0);
  useLayoutEffect(() => {
    window.dialogHostFixture.rerender = () => setRevision((value) => value + 1);
  }, []);
  return (
    <>
      <output id="fixture-revision" hidden>
        {revision}
      </output>
      <App />
    </>
  );
}

window.dialogHostFixture = {
  renders: { header: 0, footer: 0, navigation: 0, banners: 0, shell: 0, dialogs: 0 },
  fault: null,
  reports: [],
  rerender() {},
};

createRoot(fixtureElement('mount')).render(
  <StrictMode>
    <ErrorBoundary>
      <Harness />
    </ErrorBoundary>
  </StrictMode>,
);
