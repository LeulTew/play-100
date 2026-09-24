import { StrictMode } from 'react';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary>{dataUsePage ? <DataUsePage /> : <App />}</ErrorBoundary></StrictMode>,
);
