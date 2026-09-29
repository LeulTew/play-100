import { createElement as h, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App.tsx';
import { startGuestLibraryLoad } from '../../lib/guest-library-startup.ts';
import { snapshotMotionHint } from '../../lib/motion-hint.ts';
import '../../styles.css';
import '../../shared-ui.css';

declare global {
  interface Window {
    appDetailSave: { accountSaves: string[]; signOutElsewhere: () => void };
  }
}

// The real App: only cloud/OnlineController is replaced (AppDetailSave.browser-stub.tsx), so the detail dialog's save
// runs through App's own command binding. It starts as main.tsx does.
window.appDetailSave = { accountSaves: [], signOutElsewhere() {} };
snapshotMotionHint('guest');
startGuestLibraryLoad();
const root = document.getElementById('root');
if (!root) throw new Error('The App detail save fixture has no #root element.');
createRoot(root).render(h(StrictMode, null, h(App)));
