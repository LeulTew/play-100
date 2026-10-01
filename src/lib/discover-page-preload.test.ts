import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DeviceHints } from './device-capabilities';
import { discoverPageModule, scheduleDiscoverPrefetch } from './discover-page-preload';

const imports = vi.hoisted(() => vi.fn());
const loadCatalog = vi.hoisted(() => vi.fn());
vi.mock('../components/catalog/DiscoverPage', () => {
  imports();
  return { default: () => null };
});
vi.mock('./discovery-loader', () => ({ loadDiscoveryCatalog: loadCatalog }));

// The Test Lab phone: 2 GB, so background prefetch skips it, on a connection that is not saving data.
const hints: DeviceHints & { onLine?: boolean } = {};
let idle: (() => void) | undefined;
const requestIdle = vi.fn((callback: () => void) => {
  idle = callback;
  return 1;
});

beforeEach(() => {
  idle = undefined;
  Object.assign(hints, { deviceMemory: 2, hardwareConcurrency: 8, connection: undefined, onLine: true });
  loadCatalog.mockResolvedValue({ items: [] });
  vi.stubGlobal('navigator', hints);
  vi.stubGlobal('document', { hidden: false, readyState: 'complete' });
  vi.stubGlobal('window', {
    requestIdleCallback: requestIdle,
    cancelIdleCallback: vi.fn(),
    matchMedia: () => ({ matches: false }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it.each<Partial<typeof hints>>([
  { connection: { saveData: true } },
  { connection: { effectiveType: '2g' } },
  { onLine: false },
])('leaves Discover to its route while the reader keeps data light or is offline: %j', (light) => {
  Object.assign(hints, light);
  const stop = scheduleDiscoverPrefetch();
  expect(requestIdle).not.toHaveBeenCalled();
  stop();
  expect(imports).not.toHaveBeenCalled();
  expect(loadCatalog).not.toHaveBeenCalled();
});

it('loads the page module and catalog its route shares once a low-memory phone is idle', async () => {
  const stop = scheduleDiscoverPrefetch();
  expect(loadCatalog).not.toHaveBeenCalled();
  expect(discoverPageModule.started()).toBe(false);
  idle?.();
  expect(loadCatalog).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
  expect(discoverPageModule.started()).toBe(true);
  // Opening Discover now joins the prefetched module instead of importing it again.
  const module = await discoverPageModule.load();
  expect(discoverPageModule.peek()).toBe(module);
  expect(imports).toHaveBeenCalledOnce();
  stop();
});

it('leaves the catalog to the route once the route has started its own loads', () => {
  expect(discoverPageModule.started()).toBe(true);
  const stop = scheduleDiscoverPrefetch();
  idle?.();
  expect(loadCatalog).not.toHaveBeenCalled();
  stop();
});
