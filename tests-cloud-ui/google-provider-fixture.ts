import type { BrowserContext, Route } from '@playwright/test';

/*
 * A controlled Google provider for the Auth emulator suites, so that no public host decides the release gate.
 *
 * On a Google redirect, the emulator's sign-in page loads Material Components from unpkg.com and fonts from
 * fonts.googleapis.com. On the return, Firebase Auth and the emulator's helper iframe both load Google's loader script,
 * https://apis.google.com/js/api.js, and exchange the redirect result through gapi.iframes. This fixture serves empty
 * stand-ins for the sign-in page's assets and a local implementation of the part of gapi.iframes both sides use, and it
 * refuses every other request to a host outside this machine. The real service is the separately run live check,
 * tests-cloud-ui/google-live.spec.ts.
 */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const LOADER = 'https://apis.google.com/js/api.js';

// Runs in the app's document and in the emulator's helper iframe in place of Google's loader script. It provides what
// Firebase Auth and the helper iframe call: gapi.load('gapi.iframes'), opening the helper iframe from the app, and
// named messages between the two documents, whose replies return to the sender's callback.
function gapiStandIn() {
  const channel = 'play100-gapi-fixture';
  const script = document.currentScript as HTMLScriptElement | null;
  const onload = script?.src ? new URL(script.src).searchParams.get('onload') : null;
  const scope = window as unknown as Record<string, unknown>;
  type Message = { channel: string; kind: string; id: number; name?: string; data?: unknown; responses?: unknown[] };
  let nextId = 1;
  const post = (target: Window, message: Omit<Message, 'channel'>) => target.postMessage({ ...message, channel }, '*');
  // One side of the conversation with the other document: the helper iframe, seen from the app, or the app, seen
  // from the helper iframe. A message for a name no handler has registered yet waits for that handler.
  const endpoint = (peer: () => Window | null) => {
    const handlers = new Map<string, (data: unknown) => unknown>();
    const queued = new Map<string, Message[]>();
    const waiting = new Map<string, (responses?: unknown[]) => void>();
    const answer = (message: Message) => {
      void Promise.resolve(handlers.get(message.name ?? '')?.(message.data)).then((result) => {
        const target = peer();
        if (target) post(target, { kind: 'reply', id: message.id, responses: [result] });
      });
    };
    window.addEventListener('message', (event) => {
      const message = event.data as Message | null;
      const target = peer();
      if (!message || message.channel !== channel || !target || event.source !== target) return;
      if (message.kind === 'ping') post(target, { kind: 'pong', id: message.id });
      else if (message.kind === 'send') {
        const name = message.name ?? '';
        if (handlers.has(name)) answer(message);
        else queued.set(name, [...(queued.get(name) ?? []), message]);
      } else {
        const key = `${message.kind}:${message.id}`;
        const resolve = waiting.get(key);
        waiting.delete(key);
        resolve?.(message.responses);
      }
    });
    return {
      register(name: string, handler: (data: unknown) => unknown) {
        handlers.set(name, handler);
        const pending = queued.get(name) ?? [];
        queued.delete(name);
        pending.forEach(answer);
      },
      send(name: string, data: unknown, callback?: (responses?: unknown[]) => void) {
        const id = nextId++;
        waiting.set(`reply:${id}`, (responses) => callback?.(responses));
        const target = peer();
        if (target) post(target, { kind: 'send', id, name, data });
      },
      // Resolves once the other document's stand-in answers. The helper iframe may not have loaded yet, so it asks
      // again until then.
      ping(callback?: () => void) {
        return new Promise<void>((resolve) => {
          const id = nextId++;
          const ask = () => {
            const target = peer();
            if (target) post(target, { kind: 'ping', id });
          };
          const retry = setInterval(ask, 50);
          waiting.set(`pong:${id}`, () => {
            clearInterval(retry);
            callback?.();
            resolve();
          });
          ask();
        });
      },
      restyle: () => Promise.resolve(),
    };
  };
  const parent = window.parent === window ? null : endpoint(() => window.parent);
  const context = {
    open(
      options: { url: string; where?: HTMLElement; attributes?: Record<string, unknown> },
      opened?: (iframe: unknown) => unknown,
    ) {
      const element = document.createElement('iframe');
      for (const [name, value] of Object.entries(options.attributes ?? {})) {
        // Styled through the CSS object model, as Google's loader styles it, which a strict style-src-attr allows.
        if (name === 'style') Object.assign(element.style, value as Partial<CSSStyleDeclaration>);
        else element.setAttribute(name, String(value));
      }
      const iframe = { ...endpoint(() => element.contentWindow), getIframeEl: () => element };
      element.src = options.url;
      (options.where ?? document.body).append(element);
      return Promise.resolve(opened?.(iframe)).then(() => iframe);
    },
    getParentIframe: () => parent,
  };
  type LoadOptions = (() => void) | { callback?: () => void; onerror?: () => void };
  scope.gapi = {
    load(name: string, options?: LoadOptions) {
      const callback = typeof options === 'function' ? options : options?.callback;
      const failed = typeof options === 'function' ? undefined : options?.onerror;
      void Promise.resolve().then(() => (name === 'gapi.iframes' ? callback?.() : failed?.()));
    },
    iframes: { getContext: () => context, CROSS_ORIGIN_IFRAMES_FILTER: () => true, Iframe: class GapiIframe {} },
  };
  // Google's loader calls back the function named by its onload parameter, or a global gapi_onload.
  void Promise.resolve().then(() => {
    for (const hook of [onload, 'gapi_onload']) {
      const run = hook ? scope[hook] : undefined;
      if (typeof run === 'function') (run as () => void)();
    }
  });
}

const GAPI_SCRIPT = `(${gapiStandIn.toString()})();`;

export interface GoogleProvider {
  /** The origin of each document that requested Google's loader script, in order. */
  readonly loaders: string[];
  /** Requests to any other host outside this machine, which the fixture refused. */
  readonly refused: string[];
  /** Aborts the loader requests a stalled provider holds open. */
  release: () => Promise<void>;
}

/**
 * Routes every request to a host outside this machine for this browser context. A `stall` loader holds Google's loader
 * script open instead of answering, as a public host that never completes it would.
 */
export async function routeGoogleProvider(
  context: BrowserContext,
  { loader = 'serve' }: { loader?: 'serve' | 'stall' } = {},
): Promise<GoogleProvider> {
  const loaders: string[] = [];
  const refused: string[] = [];
  const held: Route[] = [];
  await context.route(
    (url) => url.protocol.startsWith('http') && !LOCAL_HOSTS.has(url.hostname),
    async (route) => {
      const url = new URL(route.request().url());
      if (`${url.origin}${url.pathname}` === LOADER) {
        let from = 'unknown';
        try {
          from = new URL(route.request().frame().url()).origin;
        } catch {
          // A request without a frame is still counted.
        }
        loaders.push(from);
        if (loader === 'stall') held.push(route);
        else await route.fulfill({ contentType: 'text/javascript', body: GAPI_SCRIPT });
      } else if (
        url.hostname === 'fonts.googleapis.com' ||
        (url.hostname === 'unpkg.com' && url.pathname.startsWith('/material-components-web@'))
      ) {
        await route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', body: '' });
      } else {
        refused.push(url.href);
        await route.abort('blockedbyclient');
      }
    },
  );
  return {
    loaders,
    refused,
    release: async () => {
      await Promise.all(held.splice(0).map((route) => route.abort().catch(() => {})));
    },
  };
}
