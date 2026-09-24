import type { ReactNode, RefObject } from 'react';
import type { useCapabilities } from '../hooks/useCapabilities';

export type MotionPolicy = Readonly<ReturnType<typeof useCapabilities>>;
export type MotionCancelReason =
  | 'scope'
  | 'authority'
  | 'navigation'
  | 'hidden'
  | 'policy'
  | 'resize'
  | 'scroll'
  | 'modal'
  | 'drag'
  | 'superseded'
  | 'unmount';

export interface MotionGuard {
  isCurrent(): boolean;
  subscribe?(onChange: () => void): () => void;
}

export interface MotionBoundary {
  readonly scopeKey: string;
  readonly generation: number;
  readonly blocked: boolean;
}

export interface MotionLocation {
  readonly viewKey: string;
  readonly requestedDetailKey: string | null;
  readonly displayedDetailKey: string | null;
  readonly navigationGeneration: number;
  readonly overlayKey: string | null;
}

export type PublicMotionVisual =
  | { readonly kind: 'jacket'; readonly rank: number }
  | {
      readonly kind: 'catalog-art';
      readonly src: `/images/discovery/${string}.webp`;
      readonly width: number;
      readonly height: number;
    };

export interface MotionOriginInput {
  readonly surface: 'collection' | 'discover';
  readonly presentationId: string;
  readonly source: HTMLElement;
  readonly trigger: HTMLElement;
  readonly visual: PublicMotionVisual;
}

export const originHintBrand: unique symbol = Symbol('motion-origin-hint');
export const originLeaseBrand: unique symbol = Symbol('motion-origin-lease');

export interface MotionOriginHint {
  readonly [originHintBrand]: true;
  readonly presentationId: string;
}

export interface MotionOriginLease {
  readonly [originLeaseBrand]: true;
  readonly presentationId: string;
  readonly signal: AbortSignal;
}

export interface MotionDetailIntent {
  readonly requestedDetailKey: string;
  readonly displayedDetailKey: string;
  readonly guard?: MotionGuard;
}

export interface MotionFrame {
  readonly transform?: string;
  readonly opacity?: number;
  readonly offset?: number;
}

export interface MotionTiming {
  readonly duration: number;
  readonly easing?: string;
}

export type MotionChannel = 'route' | 'dialog' | 'continuity' | 'drag-settle';

export interface MotionSession {
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  animate(element: Element, frames: readonly MotionFrame[], timing: MotionTiming): Animation | null;
  addCleanup(dispose: () => void): void;
  finish(): void;
  cancel(reason?: MotionCancelReason): void;
}

export interface MotionRuntime {
  originHint(input: MotionOriginInput): MotionOriginHint | null;
  captureOrigin(hint: MotionOriginHint, intent: MotionDetailIntent): MotionOriginLease | null;
  startMotionSession(options: { channel: MotionChannel; guard?: MotionGuard }): MotionSession | null;
  cancel(reason: MotionCancelReason): void;
  subscribeInterrupt(listener: (reason: MotionCancelReason) => void): () => void;
}

export interface MotionProviderProps {
  readonly policy: MotionPolicy;
  readonly boundary: MotionBoundary;
  readonly location: MotionLocation;
  readonly children: ReactNode;
}

export interface DialogMotionOptions {
  readonly preset: 'dialog' | 'sheet';
  readonly enterMs?: 160 | 180 | 220;
  readonly continuity?: {
    readonly target: RefObject<HTMLElement | null>;
    readonly lease?: MotionOriginLease;
  };
}

export type MotionSnapshot = Pick<MotionProviderProps, 'policy' | 'boundary' | 'location'>;

export interface DialogMotionHandle {
  prepareClose(): void;
  closed(): void;
  cancel(): void;
}

export interface MotionController extends MotionRuntime {
  mount(): void;
  update(): void;
  dispose(): void;
  forgetDialog(dialog: HTMLDialogElement): void;
  openDialog(
    dialog: HTMLDialogElement,
    inner: HTMLElement,
    slot: HTMLElement | null,
    options: false | DialogMotionOptions | undefined,
  ): DialogMotionHandle;
}
