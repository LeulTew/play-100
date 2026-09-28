import { StrictMode, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../../lib/browser-fixture';
import type { LibraryRecord } from '../../lib/personal-types';
import { MotionProvider, useMotionRuntime } from '../../motion/index.ts';
import { Dialog } from '../Dialog.tsx';
import { CompareTrayProvider } from './CompareTrayProvider.tsx';
import { CompareTray } from './CompareTray.tsx';
import { CompareDragHandle } from './CompareDragHandle.tsx';
import { ComparePinButton } from './ComparePinButton.tsx';
import { CompareDragSource } from './CompareDragSource.tsx';
import { useCompareDragSource } from './useCompareDragSource.ts';
import { useCompareTray } from './compare-tray-context.ts';
import '../../styles.css';

const record: LibraryRecord = {
  id: 'manual:drag-fixture',
  source: 'manual',
  sourceId: 'drag-fixture',
  title: 'Manual fixture title',
  year: 2020,
  studio: null,
  genre: null,
  sourceUrl: null,
  collectionRank: null,
};
let scope = 'guest',
  generation = 0,
  enabled = true,
  sourceVisible = true,
  dockHidden = false,
  animate = false,
  modal = false;
const root = createRoot(fixtureElement('mount'));
window.compareDragTest = {
  opens: 0,
  nested: 0,
  transfer: null,
  items: () => [],
  status: () => '',
  setScope(next) {
    generation += 1;
    scope = next;
    render();
  },
  setEnabled(next) {
    generation += 1;
    enabled = next;
    render();
  },
  setSource(next) {
    sourceVisible = next;
    render();
  },
  setDockHidden(next) {
    dockHidden = next;
    render();
  },
  setMotion(next) {
    animate = next;
    render();
  },
  setModal(next) {
    modal = next;
    render();
  },
  interrupt() {},
  unmount() {
    root.render(null);
  },
};
document.addEventListener('dragstart', (event) => {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  const types = [...transfer.types];
  window.compareDragTest.transfer = {
    types,
    values: Object.fromEntries(types.map((type) => [type, transfer.getData(type)])),
  };
});
export function Inspector() {
  const tray = useCompareTray();
  const runtime = useMotionRuntime();
  useLayoutEffect(() => {
    window.compareDragTest.items = () => tray.items.map((item) => item.id);
    window.compareDragTest.status = () => tray.status;
    window.compareDragTest.interrupt = (reason) => runtime.cancel(reason);
  }, [tray, runtime]);
  return null;
}
export function Source() {
  const sourceRef = useRef<HTMLElement>(null);
  const binding = useCompareDragSource({ record, sourceRef });
  return (
    <article id="source" ref={sourceRef} {...binding.surfaceProps}>
      <a
        id="source-title"
        href="#native-title"
        {...binding.titleProps}
        onClick={(event) => {
          if (event.defaultPrevented || binding.consumeClick(event)) return;
          if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
          event.preventDefault();
          window.compareDragTest.opens += 1;
        }}
      >
        {record.title}
      </a>
      <svg id="source-art" width={100} height={48} aria-hidden>
        <rect width={96} height={44} fill="currentColor" />
      </svg>
      <p id="selectable">Ordinary selectable game facts stay copyable.</p>
      <div id="source-controls">
        <ComparePinButton record={record} />
        <CompareDragHandle record={record} compact />
        <button
          id="nested"
          type="button"
          onClick={() => {
            window.compareDragTest.nested += 1;
          }}
        >
          Independent action
        </button>
        <input id="rating" aria-label="Your fixture rating" type="number" defaultValue="7" />
        <textarea id="note" aria-label="Your fixture note" defaultValue="Keep this private draft" />
        <details>
          <summary>Actions and source</summary>
          <a id="external" href="#source-credit">
            Source credit
          </a>
        </details>
      </div>
    </article>
  );
}
export function WrapperSource() {
  return (
    <CompareDragSource record={record}>
      {(binding) => (
        <div id="wrapper-source" className="existing-inner-row" ref={binding.sourceRef} {...binding.surfaceProps}>
          <button
            id="wrapper-title"
            type="button"
            {...binding.titleProps}
            onClick={(event) => {
              if (!event.defaultPrevented && !binding.consumeClick(event)) window.compareDragTest.opens += 1;
            }}
          >
            Wrapped title
          </button>
        </div>
      )}
    </CompareDragSource>
  );
}
function render() {
  const ticket = generation;
  const currentScope = scope;
  root.render(
    <StrictMode>
      <MotionProvider
        policy={{
          animate,
          reducedMotion: !animate,
          hidden: false,
          coarsePointer: matchMedia('(pointer:coarse)').matches,
          constrained: false,
        }}
        boundary={{ scopeKey: scope, generation, blocked: !enabled }}
        location={{
          viewKey: 'fixture',
          requestedDetailKey: null,
          displayedDetailKey: null,
          navigationGeneration: generation,
          overlayKey: null,
        }}
      >
        <CompareTrayProvider
          scope={scope}
          interaction={{
            enabled,
            captureCurrent: () => ({ isCurrent: () => generation === ticket && scope === currentScope && enabled }),
          }}
        >
          <Inspector />
          {sourceVisible && <Source />}
          <WrapperSource />
          <CompareTray hidden={dockHidden} animate={animate} onCompare={() => {}} />
          <Dialog
            open={modal}
            titleId="fixture-modal-title"
            motion={false}
            onClose={() => {
              modal = false;
              render();
            }}
          >
            <h2 id="fixture-modal-title" data-autofocus tabIndex={-1}>
              Blocking fixture
            </h2>
          </Dialog>
          <nav className="mobile-nav" aria-label="Fixture navigation">
            <button type="button">Browse</button>
          </nav>
        </CompareTrayProvider>
      </MotionProvider>
    </StrictMode>,
  );
}
render();
