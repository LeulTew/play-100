import { StrictMode, startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
import App from './App';
import DataUsePage from './components/DataUsePage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { startGuestLibraryLoad } from './lib/guest-library-startup';
import './styles.css';
import './shared-ui.css';
import './render-containment.css';

const dataUsePage = /^\/data-use\/?$/.test(location.pathname);
if (!dataUsePage) startGuestLibraryLoad();

const root = createRoot(document.getElementById('root')!);
// As a transition the first render yields to the browser every few milliseconds instead of holding
// the main thread for the whole tree. Its commit is unchanged: only effects after it apply the
// guest library and collection results.
startTransition(() => {
  root.render(
    <StrictMode>
      <ErrorBoundary>{dataUsePage ? <DataUsePage /> : <App />}</ErrorBoundary>
    </StrictMode>,
  );
});
// Last, so it marks only an entry that ran to its end: until this mark the first-paint boot script
// (src/first-paint/boot.js) may replace the shell with its failure notice. React's first commit then
// replaces #root, and the shell or the notice with it.
document.documentElement.setAttribute('data-app-started', '');
