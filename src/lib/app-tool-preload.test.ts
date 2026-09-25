import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppTools, prefetchAppTools } from './app-tool-preload';

// Records which optional tools a warm-up imports.
const imported = vi.hoisted(() => [] as string[]);
vi.mock('./catalog-detail-preload', () => ({
  loadCatalogDetail: vi.fn(async () => {
    imported.push('catalog detail');
  }),
}));
vi.mock('./discovery-parser-preload', () => ({
  loadDiscoveryParser: vi.fn(async () => {
    imported.push('catalog parser');
  }),
}));
vi.mock('./secondary-dialogs', () => ({
  loadSecondaryDialogs: vi.fn(async () => {
    imported.push('secondary dialogs');
  }),
}));
vi.mock('./google-intent', () => {
  imported.push('sign-in intent');
  return {};
});
vi.mock('./comparison-game-filter', () => {
  imported.push('comparison filter');
  return {};
});
vi.mock('./friend-comparison-intent', () => {
  imported.push('comparison intent');
  return {};
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('optional tool warm-up', () => {
  it('warms at idle only what a page opens without navigating, and the rest on its own intent', async () => {
    await loadAppTools();
    await settle();
    expect(imported, 'what a page opens without navigating').toEqual(['catalog detail', 'catalog parser']);
    vi.stubGlobal('document', { hidden: false });
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    prefetchAppTools('account');
    prefetchAppTools('friends');
    await settle();
    expect(imported, 'a constrained device warms nothing on intent').toHaveLength(2);
    vi.stubGlobal('navigator', {});
    prefetchAppTools('account');
    prefetchAppTools('friends');
    await vi.waitFor(() => expect(imported).toHaveLength(5));
    expect(imported.slice(2).sort()).toEqual(['comparison filter', 'comparison intent', 'sign-in intent']);
    expect(imported, 'the secondary dialogs warm on Menu intent').not.toContain('secondary dialogs');
  });
});
