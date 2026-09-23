export interface PwaAsset {
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly type: 'html' | 'script' | 'style' | 'font' | 'json' | 'image' | 'manifest';
}

export interface PwaBuildManifest {
  readonly format: 1;
  readonly version: string;
  readonly documentPolicy: PwaDocumentPolicy;
  readonly core: readonly PwaAsset[];
  readonly images: readonly PwaAsset[];
}

export interface PwaDocumentPolicy {
  readonly headers: readonly { readonly name: string; readonly value: string }[];
  readonly sha256: string;
}

export type PwaInstallState = 'unavailable' | 'prompt' | 'ios-instructions' | 'installed';
export type PwaOfflineState = 'idle' | 'preparing' | 'ready' | 'error';
export type PwaUpdateState = 'none' | 'waiting' | 'applying' | 'reload-required';

export interface PwaState {
  readonly installState: PwaInstallState;
  readonly offlineState: PwaOfflineState;
  readonly updateState: PwaUpdateState;
  readonly online: boolean;
  readonly message: string;
  readonly error: string;
}

export interface PwaUpdateGuard {
  prepare(): Promise<boolean>;
  isCurrent(): boolean;
  canReload(): boolean;
}

export interface PwaController {
  getSnapshot(): PwaState;
  subscribe(listener: () => void): () => void;
  connect(): () => void;
  install(): Promise<'accepted' | 'dismissed' | 'instructions' | 'unavailable'>;
  prepareOffline(): Promise<boolean>;
  checkForUpdate(): Promise<void>;
  applyUpdate(guard: PwaUpdateGuard): Promise<boolean>;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaWorkerClient {
  readonly id: string;
  readonly url: string;
  readonly type: string;
  readonly frameType: string;
  postMessage(message: unknown): void;
}

export interface PwaFetchEvent {
  readonly request: Request;
  readonly clientId?: string;
  readonly resultingClientId?: string;
  respondWith(response: Promise<Response>): void;
  waitUntil(work: Promise<unknown>): void;
}

export interface PwaMessageEvent {
  readonly data: unknown;
  readonly source: PwaWorkerClient | null;
  readonly ports: readonly MessagePort[];
  waitUntil(work: Promise<unknown>): void;
}

export interface PwaWorkerHost {
  readonly location: Pick<Location, 'origin'>;
  readonly caches: {
    open(name: string): Promise<{
      match(request: RequestInfo | URL): Promise<Response | undefined>;
      put(request: RequestInfo | URL, response: Response): Promise<void>;
      keys(): Promise<Request[]>;
      delete(request: RequestInfo | URL): Promise<boolean>;
    }>;
    keys(): Promise<string[]>;
    delete(name: string): Promise<boolean>;
  };
  readonly crypto: { readonly subtle: Pick<SubtleCrypto, 'digest'> };
  readonly registration: { readonly active: { readonly state: string } | null };
  readonly clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<PwaWorkerClient[]>;
    claim(): Promise<void>;
  };
  fetch(request: Request): Promise<Response>;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', handler: (event: { waitUntil(work: Promise<unknown>): void }) => void): void;
  addEventListener(type: 'fetch', handler: (event: PwaFetchEvent) => void): void;
  addEventListener(type: 'message', handler: (event: PwaMessageEvent) => void): void;
}
