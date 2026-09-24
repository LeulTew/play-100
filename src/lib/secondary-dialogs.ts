import { createRetryableModule } from './retryable-module';

export const aboutDialogModule = createRetryableModule(() => import('../components/AboutDialog'));
export const settingsDialogModule = createRetryableModule(() => import('../components/app/SettingsPanel'));

export type AppPanel = 'menu' | 'about' | 'settings' | 'account' | null;

export function secondaryDialogsStarted(): boolean {
  return aboutDialogModule.started() && settingsDialogModule.started();
}

export function secondaryDialogReady(panel: AppPanel): boolean {
  return panel === 'about'
    ? aboutDialogModule.peek() !== null
    : panel === 'settings'
      ? settingsDialogModule.peek() !== null
      : true;
}

export function loadSecondaryDialog(panel: 'about' | 'settings'): Promise<unknown> {
  return panel === 'about' ? aboutDialogModule.load() : settingsDialogModule.load();
}

export function loadSecondaryDialogs(): Promise<unknown> {
  return Promise.all([aboutDialogModule.load(), settingsDialogModule.load()]);
}
