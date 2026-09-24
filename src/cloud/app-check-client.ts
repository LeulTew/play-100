import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import type { FirebaseApp } from 'firebase/app';

export function startAppCheck(app: FirebaseApp, siteKey: string): void {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
}
