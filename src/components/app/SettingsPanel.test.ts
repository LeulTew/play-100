import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import type { SettingsPanelProps } from './SettingsPanel';
import { emptyPersonalLibrary } from '../../lib/personal-library';
import { initialPwaState } from '../../pwa/client';

function props(controlsReady: boolean, error = '', moduleError = false): SettingsPanelProps {
  return {
    settings: {
      motion: 'auto',
      reducedMotion: false,
      constrained: false,
      saved: 0,
      completed: 0,
      warning: null,
      onMotion: vi.fn(async () => true),
      onReset: vi.fn(async () => true),
      state: emptyPersonalLibrary(),
      persistent: true,
      busy: false,
      onRestore: vi.fn(async () => true),
      onAbout: vi.fn(),
      onClose: vi.fn(),
    },
    offline: {
      open: true,
      onUpdate: vi.fn(async () => false),
      pwa: {
        ...initialPwaState,
        controlsReady,
        error,
        moduleError,
        install: vi.fn(async () => 'unavailable' as const),
        prepareOffline: vi.fn(async () => false),
        checkForUpdate: vi.fn(async () => {}),
        applyUpdate: vi.fn(async () => false),
      },
    },
  };
}

describe('Settings PWA adapter readiness', () => {
  it.each([
    [false, '', false, true],
    [true, '', false, false],
    [false, 'Offline controls could not load.', false, false],
    [false, "Offline controls didn't load.", true, true],
  ] as const)(
    'keeps preparation disabled for pending or terminal controls and exposes recovery for module failure',
    (ready, error, moduleError, disabled) => {
      const input = props(ready, error, moduleError);
      const html = renderToStaticMarkup(createElement(SettingsPanel, input));
      const button = html.match(/<button[^>]*>Enable offline access<\/button>/)?.[0];
      expect(button).toBeDefined();
      expect(button?.includes('disabled=""')).toBe(disabled);
      expect(html).toContain('data-autofocus="true" tabindex="-1">Make it');
      expect(html).not.toContain('Preparing offline files…');
      expect(html.includes('Loading offline controls…')).toBe(!ready && !error);
      expect(input.offline?.pwa.prepareOffline).not.toHaveBeenCalled();
      expect(html.includes('Reload this page')).toBe(moduleError);
    },
  );
});
