import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
import App from './App';
import DataUsePage from './components/DataUsePage';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import './personal.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary>{/^\/data-use\/?$/.test(location.pathname) ? <DataUsePage /> : <App />}</ErrorBoundary></StrictMode>,
);
