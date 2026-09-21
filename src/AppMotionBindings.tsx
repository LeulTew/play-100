import { useCallback, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { CompareInteractionGate } from './components/compare-tray/compare-drag-types';
import { useRouteArrival } from './hooks/useRouteArrival';
import { routeFamily } from './lib/route-continuity';
import type { LibraryRecord } from './lib/personal-types';
import type { PreviewAuthority } from './lib/preview-authority';
import type { AppPage } from './lib/types';
import { useMotionRuntime } from './motion';
import type { MotionBoundary, MotionGuard, MotionLocation, MotionOriginHint, MotionOriginLease } from './motion';

export interface PreparedPreview {
  readonly requestedDetailKey: string;
  readonly displayedDetailKey: string;
}

interface OriginTicket extends PreparedPreview {
  readonly lease: MotionOriginLease;
  readonly scopeKey: string;
  readonly boundaryGeneration: number;
  readonly expectedNavigation: number;
}

interface MotionBindings {
  openCollection(slug: string, hint?: MotionOriginHint): void;
  preview(record: LibraryRecord, authority?: PreviewAuthority, hint?: MotionOriginHint): void;
  previewFromDiscover(record: LibraryRecord, hint?: MotionOriginHint): void;
  origin: MotionOriginLease | undefined;
  interaction: CompareInteractionGate;
}

export function AppMotionBindings({
  mainRef, page, boundary, motionLocation, navigation, blocked, onOpen, preparePreview, children,
}: {
  mainRef: RefObject<HTMLElement | null>;
  page: AppPage;
  boundary: MotionBoundary;
  motionLocation: MotionLocation;
  navigation: RefObject<number>;
  blocked: boolean;
  onOpen: (id: string) => void;
  preparePreview: (record: LibraryRecord, authority?: PreviewAuthority) => PreparedPreview | null;
  children: (bindings: MotionBindings) => ReactNode;
}) {
  const runtime = useMotionRuntime();
  const current = useRef({ boundary, motionLocation, blocked });
  current.current = { boundary, motionLocation, blocked };
  const origin = useRef<OriginTicket | null>(null);

  useRouteArrival(mainRef, {
    family: routeFamily(page),
    scopeEpoch: boundary.generation,
    navigationEpoch: motionLocation.navigationGeneration,
    blocked: boundary.blocked || blocked,
  });

  const capture = useCallback((intent: PreparedPreview, hint?: MotionOriginHint, authority?: PreviewAuthority) => {
    const snapshot = current.current;
    const guard: MotionGuard = {
      isCurrent: () => {
        const next = current.current.boundary;
        return !next.blocked && next.scopeKey === snapshot.boundary.scopeKey &&
          next.generation === snapshot.boundary.generation &&
          (!authority || authority.scope === next.scopeKey && authority.permits(intent.requestedDetailKey));
      },
      subscribe: authority ? listener => authority.subscribe(listener) : undefined,
    };
    // Continuity owns its upcoming navigation; its guard is authority-only.
    const lease = hint ? runtime.captureOrigin(hint, { ...intent, guard }) : null;
    if (!lease && origin.current && !origin.current.lease.signal.aborted) runtime.cancel('superseded');
    origin.current = lease ? {
      ...intent, lease,
      scopeKey: snapshot.boundary.scopeKey,
      boundaryGeneration: snapshot.boundary.generation,
      expectedNavigation: snapshot.motionLocation.navigationGeneration + 1,
    } : null;
  }, [runtime]);

  const openCollection = useCallback((slug: string, hint?: MotionOriginHint) => {
    capture({ requestedDetailKey: slug, displayedDetailKey: slug }, hint);
    onOpen(slug);
  }, [capture, onOpen]);

  const preview = useCallback((record: LibraryRecord, authority?: PreviewAuthority, hint?: MotionOriginHint) => {
    const intent = preparePreview(record, authority);
    if (!intent) return;
    capture(intent, hint, authority);
    onOpen(intent.requestedDetailKey);
  }, [preparePreview, capture, onOpen]);

  const previewFromDiscover = useCallback((record: LibraryRecord, hint?: MotionOriginHint) => {
    preview(record, undefined, hint);
  }, [preview]);

  const captureCurrent = useCallback((): MotionGuard => {
    const snapshot = current.current;
    const startedNavigation = navigation.current;
    return {
      isCurrent: () => {
        const next = current.current;
        return !next.blocked && !next.boundary.blocked &&
          next.boundary.scopeKey === snapshot.boundary.scopeKey &&
          next.boundary.generation === snapshot.boundary.generation &&
          navigation.current === startedNavigation;
      },
    };
  }, [navigation]);
  const enabled = !blocked && !boundary.blocked;
  const interaction = useMemo(() => ({ enabled, captureCurrent }), [enabled, captureCurrent]);
  const ticket = origin.current;
  const activeOrigin = ticket && !ticket.lease.signal.aborted &&
    ticket.scopeKey === boundary.scopeKey && ticket.boundaryGeneration === boundary.generation &&
    ticket.expectedNavigation === motionLocation.navigationGeneration &&
    ticket.requestedDetailKey === motionLocation.requestedDetailKey &&
    ticket.displayedDetailKey === motionLocation.displayedDetailKey
    ? ticket.lease : undefined;

  return children({ openCollection, preview, previewFromDiscover, origin: activeOrigin, interaction });
}
