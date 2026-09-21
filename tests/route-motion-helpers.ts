import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { MotionPolicy } from '../src/motion';
import type { CommittedRouteState, RouteFamily } from '../src/lib/route-continuity';
import type { MyGamesView } from '../src/components/personal/MyGamesPage';
import type { Filters } from '../src/lib/types';
import type { PersonalLibraryState } from '../src/lib/personal-types';
import { installGuestLibrary, libraryFixture } from './library-pagination-helpers';

interface ArrivalEvent {
  target: 'heading' | 'tab' | 'range' | 'other';
  duration: number;
  transforms: Array<string | undefined>;
  ended: boolean;
}
interface MotionHarnessControls {
  route: CommittedRouteState;
  policy: Partial<MotionPolicy>;
  view: MyGamesView;
  filters: Filters;
  loading: boolean;
}
interface MotionHarness {
  patch(value: Partial<MotionHarnessControls>): void;
  requestRoute(family: RouteFamily): Promise<boolean>;
  holdEdit(): void;
  finishEdit(saved: boolean): void;
  destroy(): void;
  opened: string[];
  stored(): PersonalLibraryState;
}
declare global {
  interface Window {
    routeArrivalLog: { events: ArrivalEvent[]; pause: boolean };
    routeArrivalHarness: MotionHarness;
  }
}

export async function mountMotionFixture(page: Page, workspace = false) {
  const fixture = { ...libraryFixture(), motion: 'full' as const };
  await installGuestLibrary(page, fixture);
  await page.goto('/data-use');
  await expect(page.getByRole('heading', { name: 'Data use', exact: true })).toBeVisible();
  await page.evaluate(async ({ fixture, workspace }) => {
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const reactUrl = resources.findLast(url => new URL(url).pathname === '/node_modules/.vite/deps/react.js');
    const domUrl = resources.findLast(url => new URL(url).pathname === '/node_modules/.vite/deps/react-dom_client.js');
    if (!reactUrl || !domUrl) throw new Error('Use the application Vite React modules for this mounted fixture.');
    const { default: React }: { default: typeof import('react') } = await import(reactUrl);
    const { default: ReactDom }: { default: typeof import('react-dom/client') } = await import(domUrl);
    const myGamesPath = '/src/components/personal/MyGamesPage.tsx';
    const { default: MyGames }: typeof import('../src/components/personal/MyGamesPage') = await import(myGamesPath);
    const motionPath = performance.getEntriesByType('resource').findLast(entry =>
      new URL(entry.name).pathname === '/src/motion/index.ts')?.name;
    const exitPath = performance.getEntriesByType('resource').findLast(entry =>
      new URL(entry.name).pathname === '/src/hooks/useExitSave.ts')?.name;
    if (!motionPath || !exitPath) throw new Error('The actual mounted motion and editor modules must be loaded first.');
    const { MotionProvider, useMotionPolicy }: typeof import('../src/motion') = await import(motionPath);
    const { registerPendingEditor, flushPendingEdits }: typeof import('../src/hooks/useExitSave') = await import(exitPath);
    const capabilitiesPath = '/src/hooks/useCapabilities.ts';
    const { useCapabilities }: typeof import('../src/hooks/useCapabilities') = await import(capabilitiesPath);
    const libraryPath = '/src/hooks/useLibrary.ts';
    const { useLibrary }: typeof import('../src/hooks/useLibrary') = await import(libraryPath);
    const routePath = '/src/hooks/useRouteArrival.ts';
    const { useRouteArrival }: typeof import('../src/hooks/useRouteArrival') = await import(routePath);
    const container = document.createElement('div');
    container.id = 'route-motion-fixture';
    document.body.append(container);
    document.querySelector<HTMLElement>('#root')?.setAttribute('hidden', '');
    const root = ReactDom.createRoot(container);
    const records = Object.values(fixture.records);
    let controls: MotionHarnessControls = {
      route: { family: workspace ? 'my-games' : 'collection', scopeEpoch: 0, navigationEpoch: 0, blocked: false },
      policy: {}, view: 'library', loading: false,
      filters: { q: '', genre: 'all', year: 'all', tier: 'all', list: 'all', sort: 'rank', direction: 'auto', view: 'grid', catalogs: 'off' },
    };
    let releaseEdit: (() => Promise<boolean>) | null = null;
    let completeEdit: ((saved: boolean) => void) | null = null;
    let edited = false;
    const opened: string[] = [];
    window.routeArrivalLog = { events: [], pause: false };
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = originalAnimate.apply(this, args);
      if (this.closest('#route-motion-fixture')) {
        const effect = animation.effect;
        const entry: ArrivalEvent = {
          target: this.matches('h1') ? 'heading' : this.matches('.my-games-tab-marker') ? 'tab' : this.matches('.local-pager > p') ? 'range' : 'other',
          duration: Number(effect?.getTiming().duration),
          transforms: effect instanceof KeyframeEffect ? effect.getKeyframes().map(frame => typeof frame.transform === 'string' ? frame.transform : undefined) : [],
          ended: false,
        };
        window.routeArrivalLog.events.push(entry);
        animation.addEventListener('finish', () => { entry.ended = true; }, { once: true });
        animation.addEventListener('cancel', () => { entry.ended = true; }, { once: true });
        if (window.routeArrivalLog.pause) animation.pause();
      }
      return animation;
    };
    const patch = (value: Partial<MotionHarnessControls>) => { controls = { ...controls, ...value }; render(); };
    const changeView = (view: MyGamesView) => {
      patch({ view, route: { ...controls.route, navigationEpoch: controls.route.navigationEpoch + 1 } });
    };
    function Content({ library }: { library: ReturnType<typeof useLibrary> }) {
      const main = React.useRef<HTMLElement>(null);
      const policy = useMotionPolicy();
      useRouteArrival(main, controls.route);
      return React.createElement('main', { ref: main },
        workspace ? React.createElement(MyGames, {
          state: library.state, filters: controls.filters, busy: library.busy, animate: policy.animate, scope: 'guest',
          availableRecords: records, persistent: library.status === 'ready', view: controls.view, onViewChange: changeView,
          onAction: library.perform, onOpen: id => { opened.push(id); },
          onDiscover: () => {}, onBrowse: () => {},
          onFilters: next => patch({ filters: { ...controls.filters, ...next }, route: { ...controls.route, navigationEpoch: controls.route.navigationEpoch + 1 } }),
        }) : React.createElement('section', { className: controls.loading ? 'page-loading' : 'app-page' },
          React.createElement('h1', { 'data-page-heading': '', tabIndex: -1 }, controls.loading ? 'Loading...' : controls.route.family),
          React.createElement('label', null, 'Uncontrolled draft', React.createElement('input', { 'aria-label': 'Uncontrolled draft', defaultValue: '' })),
        ));
    }
    function Fixture() {
      const library = useLibrary(records, false);
      const actualPolicy = useCapabilities(library.state.motion);
      window.routeArrivalHarness.stored = () => library.state;
      return React.createElement(MotionProvider, {
        policy: { ...actualPolicy, ...controls.policy },
        boundary: { scopeKey: 'guest', generation: controls.route.scopeEpoch, blocked: controls.route.blocked },
        location: {
          viewKey: `${controls.route.family}:${controls.view}:${controls.filters.progress ?? 'all'}`,
          requestedDetailKey: null, displayedDetailKey: null,
          navigationGeneration: controls.route.navigationEpoch, overlayKey: null,
        },
        children: React.createElement(Content, { library }),
      });
    }
    function render() { root.render(React.createElement(React.StrictMode, null, React.createElement(Fixture))); }
    window.routeArrivalHarness = {
      patch,
      requestRoute: async family => {
        const before = controls.route;
        if (!await flushPendingEdits() || controls.route.scopeEpoch !== before.scopeEpoch ||
          controls.route.navigationEpoch !== before.navigationEpoch) return false;
        patch({ route: { ...before, family, navigationEpoch: before.navigationEpoch + 1 } });
        return true;
      },
      holdEdit: () => {
        edited = true;
        const wait = new Promise<boolean>(resolve => { completeEdit = resolve; });
        releaseEdit = registerPendingEditor({ pending: () => edited, flush: () => wait });
      },
      finishEdit: saved => {
        edited = false;
        completeEdit?.(saved);
        void releaseEdit?.();
      },
      destroy: () => {
        edited = false;
        completeEdit?.(false);
        void releaseEdit?.();
        root.unmount();
        container.remove();
        Element.prototype.animate = originalAnimate;
        document.querySelector<HTMLElement>('#root')?.removeAttribute('hidden');
      },
      opened,
      stored: () => fixture,
    };
    render();
  }, { fixture, workspace });
  await expect(page.locator('#route-motion-fixture h1')).toBeVisible();
  if (workspace) await expect(page.locator('#route-motion-fixture ul.personal-records > .personal-row-static')).toHaveCount(25);
}

export async function arrivalEvents(page: Page, target?: ArrivalEvent['target']) {
  return page.evaluate(target => window.routeArrivalLog.events.filter(event => !target || event.target === target), target);
}

export async function patchRoute(page: Page, patch: Partial<CommittedRouteState>) {
  await page.evaluate(patch => {
    const current = {
      family: document.querySelector('#route-motion-fixture h1')?.textContent as RouteFamily,
      scopeEpoch: Number(document.documentElement.dataset.testScopeEpoch ?? 0),
      navigationEpoch: Number(document.documentElement.dataset.testNavigationEpoch ?? 0),
      blocked: false,
    };
    const route = { ...current, ...patch };
    document.documentElement.dataset.testScopeEpoch = String(route.scopeEpoch);
    document.documentElement.dataset.testNavigationEpoch = String(route.navigationEpoch);
    window.routeArrivalHarness.patch({ route });
  }, patch);
}
