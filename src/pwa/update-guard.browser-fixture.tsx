import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../lib/browser-fixture';
import { isRecord } from '../lib/guards';
import { createPwaUpdateGuard, useInputGeneration } from './update-guard.ts';
import { executePwaUpdate } from './apply-update.ts';
import { ChunkRecovery } from '../components/ChunkRecovery.tsx';
import { ReloadGuardContext } from '../lib/reload-guard-context.ts';
import { registerPendingEditor } from '../hooks/useExitSave.ts';
const version = 'a'.repeat(64);
let requests = 0;
let held: (() => void)[] = [];
window.pageInstance = Math.random();
window.statusRequests = () => requests;
window.releaseStatus = () => {
  const replies = held;
  held = [];
  replies.forEach((reply) => reply());
};
class FixtureWorker extends EventTarget implements ServiceWorker {
  readonly scriptURL = location.origin + '/sw.js';
  readonly state: ServiceWorkerState = 'activated';
  onstatechange: ServiceWorker['onstatechange'] = null;
  onerror: ServiceWorker['onerror'] = null;
  postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
    const [port] = Array.isArray(options) ? options : (options?.transfer ?? []);
    if (!(port instanceof MessagePort) || !isRecord(message)) throw new Error('Invalid fixture worker request.');
    requests++;
    held.push(() => port.postMessage({ channel: 'play100-pwa-v1', version, ready: message.type === 'STATUS' }));
  }
}
const worker = new FixtureWorker();
Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => worker });
export function Harness() {
  const inputGeneration = useInputGeneration();
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const apply = () => {
    setState('applying');
    setError('');
    const guard = createPwaUpdateGuard({ isCurrent: () => true, busy: () => false, inputGeneration });
    void executePwaUpdate(worker, true, guard, {
      isCurrent: () => true,
      waiting: () => null,
      requestedVersion: () => version,
      rememberVersion() {},
      publish: (patch) => {
        if (patch.updateState) setState(patch.updateState);
        if (patch.error) setError(patch.error);
      },
      report: (message) => setError(message),
    });
  };
  return h(
    'main',
    null,
    h('input', { 'aria-label': 'Search games' }),
    h('button', { onClick: apply }, 'Apply update'),
    h('p', { 'data-testid': 'update-state' }, state),
    h('p', { role: 'alert' }, error),
  );
}
let scope = 0,
  busy = false,
  pendingRating = false,
  failSave = false,
  saves = 0;
registerPendingEditor({
  pending: () => pendingRating,
  flush: async () => {
    saves++;
    if (failSave) return false;
    pendingRating = false;
    return true;
  },
});
window.recoveryGuardFixture = {
  failSave: () => {
    failSave = true;
  },
  busy: () => {
    busy = true;
  },
  changeScope: () => {
    scope++;
  },
  saves: () => saves,
};
export function RecoveryHarness() {
  const inputGeneration = useInputGeneration();
  const [draft, setDraft] = useState('');
  const [savedName, setSavedName] = useState('Player');
  const [savedEdited, setSavedEdited] = useState(false);
  const capture = () => {
    const start = scope;
    return createPwaUpdateGuard({ isCurrent: () => start === scope, busy: () => busy, inputGeneration });
  };
  return (
    <ReloadGuardContext.Provider value={capture}>
      <main>
        <form onSubmit={(event) => event.preventDefault()}>
          <input aria-label="Manual title" value={draft} onChange={(event) => setDraft(event.target.value)} />
        </form>
        <form data-unsaved={savedEdited ? 'true' : 'false'} onSubmit={(event) => event.preventDefault()}>
          <input
            aria-label="Saved name"
            value={savedName}
            onChange={(event) => {
              setSavedName(event.target.value);
              setSavedEdited(true);
            }}
          />
        </form>
        <input
          type="number"
          aria-label="Pending rating"
          onChange={() => {
            pendingRating = true;
          }}
        />
        <input aria-label="Search games" />
        <ChunkRecovery message="Fixture module failed." />
      </main>
    </ReloadGuardContext.Provider>
  );
}
createRoot(fixtureElement('root')).render(
  h(location.pathname === '/chunk-recovery-guard-fixture' ? RecoveryHarness : Harness),
);
