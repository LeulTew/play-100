import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import type { AppPage } from '../../lib/types';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { Dialog } from '../Dialog';
import { Icon } from '../Icon';
import { GameArtwork, GameArtworkCredit } from '../games/GameArtwork';
import type { GameArtworkProps } from '../games/GameArtwork';
import { useCompareTray } from './compare-tray-context';
import { CompareDragSourceContext } from './compare-drag-source-context';
import { measureTrayMetrics, scheduleTrayMetrics, TRAY_METRIC_PROPERTIES } from './tray-metrics';
import './compare-tray.css';

export interface CompareTrayProps {
  onCompare: (records: LibraryRecord[]) => void;
  onPreview?: (record: LibraryRecord) => void;
  onVisibilityChange?: (visible: boolean) => void;
  resolveArtwork?: (record: LibraryRecord) => GameArtworkProps['artwork'];
  animate?: boolean;
  hidden?: boolean;
  page?: AppPage;
  layout?: 'dock' | 'inline';
}

export function CompareTray(props: CompareTrayProps) {
  const { currentScope } = useCompareTray();
  return <ScopedCompareTray key={currentScope} {...props} />;
}

function ScopedCompareTray({
  onCompare,
  onPreview,
  onVisibilityChange,
  resolveArtwork,
  animate = false,
  hidden = false,
  page,
  layout = 'dock',
}: CompareTrayProps) {
  const compact = page !== undefined && page !== 'collection';
  const { items, unpin, clear, dismissError, warning, error, persistent, dragging } = useCompareTray();
  const controller = useContext(CompareDragSourceContext);
  const [open, setOpen] = useState(false);
  const visible = open && !hidden;
  const [documentVisible, setDocumentVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const id = useId();
  const expand = useRef<HTMLButtonElement>(null);
  const sheetTitle = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const dock = useRef<HTMLElement | null>(null);
  const inlineRevealed = useRef(false);
  const measuredMetrics = useRef(false);
  const newestId = items.at(-1)?.id;
  const dockRef = useCallback(
    (node: HTMLElement | null) => {
      dock.current = node;
      controller?.setDock(node);
    },
    [controller],
  );
  const arrivalRef = useCallback(
    (node: HTMLSpanElement | null) => {
      controller?.setArrivalTarget(animate ? newestId : undefined, node);
    },
    [controller, newestId, animate],
  );
  const hasContent = items.length > 0 || Boolean(warning) || Boolean(error);
  const hasTray = hasContent || dragging;
  useLayoutEffect(() => {
    const node = dock.current;
    const header = document.querySelector('.site-header');
    const navigation = document.querySelector('.mobile-nav');
    const toast = document.querySelector('.toast');
    const metrics = scheduleTrayMetrics(
      () =>
        measureTrayMetrics({
          style: document.documentElement.style,
          header,
          navigation,
          toast,
          tray: node && !hidden && hasTray ? node : null,
        }),
      measuredMetrics,
    );
    // Once a tray shows or the heights are set, measuring now forces the layout of what React has just
    // inserted inside the commit's own task, which stays short, instead of the frame after it, which
    // also paints. The reads come before the writes, so it forces that layout once. The app's first
    // commit, with no tray, leaves its heights to the observer instead (scheduleTrayMetrics).
    if (hasTray || measuredMetrics.current) metrics.now();
    const focused = document.activeElement;
    if (!hasContent || layout !== 'inline') inlineRevealed.current = false;
    if (layout === 'inline' && hasContent && !hidden && !dragging && node && !inlineRevealed.current) {
      inlineRevealed.current = true;
      const table = node.closest('.ratings-mode')?.querySelector('.ratings-scroll');
      // Reveal the first table pin and its next action, not an unrelated view switch.
      if (focused instanceof HTMLElement && table?.contains(focused)) {
        const next = focused
          .closest('tr')
          ?.nextElementSibling?.querySelector<HTMLElement>('.table-progress > button:last-child');
        table.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
        next?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
    }
    if (
      hasContent &&
      !hidden &&
      !dragging &&
      layout === 'dock' &&
      focused instanceof HTMLElement &&
      focused.closest('.game-card, .discovery-card, .personal-records')
    ) {
      const target = focused.getBoundingClientRect();
      const obstruction = error ? toast?.getBoundingClientRect() : null;
      const floor = window.innerHeight - (navigation?.getBoundingClientRect().height ?? 0);
      if (
        target.bottom > floor ||
        target.top < (header?.getBoundingClientRect().bottom ?? 0) ||
        (obstruction &&
          target.bottom > obstruction.top &&
          target.top < obstruction.bottom &&
          target.right > obstruction.left &&
          target.left < obstruction.right)
      )
        focused.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }
    // The table's strip is the only place a tray error shows (UX-007), so bring all of it into view.
    if (error && layout === 'inline' && !hidden)
      node
        ?.querySelector('.compare-tray-error')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const observer = new ResizeObserver(metrics.resized);
    [header, navigation, toast, node].forEach((element) => {
      if (element) observer.observe(element);
    });
    node
      ?.querySelectorAll('.compare-tray-error, .compare-tray-storage-mark')
      .forEach((element) => observer.observe(element));
    // The heights stay set while the effect re-runs, so the next measurement writes only what moved.
    return () => {
      observer.disconnect();
      metrics.cancel();
    };
  }, [hasTray, hasContent, hidden, compact, error, warning, layout, dragging]);
  useLayoutEffect(
    () => () => {
      for (const property of TRAY_METRIC_PROPERTIES) document.documentElement.style.removeProperty(property);
    },
    [],
  );
  useEffect(() => {
    const onVisibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    onVisibilityChange?.(visible);
    return () => onVisibilityChange?.(false);
  }, [visible, onVisibilityChange]);
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    // Browser Back or Forward closes the sheet rather than changing the page beneath it (UX-027).
    const back = (event: Event) => {
      if (event.isTrusted) setOpen(false);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, [open]);
  const compare = () => {
    if (!items.length) return;
    close();
    onCompare(items.map((record) => ({ ...record })));
  };
  const remove = (record: LibraryRecord) => {
    const index = items.findIndex((item) => item.id === record.id);
    if (!unpin(record.id)) return;
    // Choose a still-mounted target before removing the focused row.
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('[data-unpin]');
    (buttons?.[index + 1] ?? buttons?.[index - 1] ?? sheetTitle.current)?.focus({ preventScroll: true });
  };
  const label = persistent ? 'Compare tray' : 'Temporary tray';
  return (
    <div className="compare-tray-anchor">
      {hasTray && !hidden && (
        <aside
          ref={dockRef}
          className={`compare-tray-dock compare-tray-${layout === 'dock' ? 'chip' : 'inline'}`}
          aria-label="Pinned games for comparison"
          data-compact={compact}
          data-animate={animate && documentVisible ? 'true' : 'false'}
          data-dragging={dragging}
          data-has-content={hasContent}
          data-layout={layout}
          onDragOver={(event) => controller?.nativeOver(event.nativeEvent)}
          onDrop={(event) => controller?.nativeDrop(event.nativeEvent)}
        >
          {dragging && (
            <span className="compare-tray-drop-label">
              <Icon name="plus" width="20" height="20" />
              Drop to pin for comparison
            </span>
          )}
          <button
            ref={expand}
            type="button"
            className="compare-tray-expand"
            aria-label={`${items.length} ${items.length === 1 ? 'game' : 'games'} in ${label}`}
            title={`Open ${label}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <span className="compare-tray-stack" aria-hidden="true">
              {items.slice(-3).map((record) => (
                <span className="compare-tray-jacket" key={record.id}>
                  <span className="compare-tray-jacket-arrival" ref={record.id === newestId ? arrivalRef : undefined}>
                    <GameArtwork record={record} artwork={resolveArtwork?.(record)} />
                  </span>
                </span>
              ))}
            </span>
            <span className="compare-tray-count">
              <strong>
                {items.length}{' '}
                <span className={layout === 'dock' ? 'sr-only' : undefined}>
                  {items.length === 1 ? 'game' : 'games'}
                </span>
              </strong>{' '}
              <span>in {label}</span>
            </span>
            <Icon name={layout === 'dock' ? 'stack' : 'up'} width="16" height="16" />
          </button>
          <button
            type="button"
            className="button button-lime compare-tray-action"
            aria-label="Compare rankings with friends"
            disabled={!items.length}
            onClick={compare}
          >
            <span>
              Compare rankings <span className="compare-tray-action-context">with friends</span>
            </span>
            <Icon name="arrow" width="18" height="18" />
          </button>
          {warning && (
            <span
              className="compare-tray-storage-mark"
              role="img"
              aria-label="Tray storage needs attention"
              title="Open the tray to review its storage warning"
            >
              <Icon name="info" width="17" height="17" />
            </span>
          )}
          {error && layout === 'inline' && (
            <div className="compare-tray-error">
              <p>{error}</p>
              <button
                type="button"
                className="icon-button"
                aria-label="Dismiss Compare tray message"
                onClick={() => {
                  dismissError();
                  expand.current?.focus({ preventScroll: true });
                }}
              >
                <Icon name="close" width="18" height="18" />
              </button>
            </div>
          )}
        </aside>
      )}
      <Dialog
        open={visible}
        titleId={`${id}-title`}
        descriptionId={`${id}-description`}
        onClose={close}
        className="compare-tray-sheet"
      >
        <h2 ref={sheetTitle} id={`${id}-title`} tabIndex={-1} data-autofocus>
          Compare tray
        </h2>
        <p id={`${id}-description`} className="compare-tray-description">
          {items.length
            ? `${items.length} of 6 games. Choose friends to compare their rankings of these games.`
            : 'Pin a game while browsing to hold it here.'}{' '}
          Pinning does not save, rate or share a game.
        </p>
        {warning && (
          <div className="compare-tray-warning" role="alert">
            <p>{warning}</p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                clear();
                sheetTitle.current?.focus();
              }}
            >
              Reset saved tray
            </button>
          </div>
        )}
        {error && (
          <div className="compare-tray-error">
            <p>{error}</p>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss Compare tray message"
              onClick={() => {
                dismissError();
                sheetTitle.current?.focus({ preventScroll: true });
              }}
            >
              <Icon name="close" width="18" height="18" />
            </button>
          </div>
        )}
        <ul ref={list} className="compare-tray-games" aria-label="Pinned games">
          {items.map((record) => (
            <li key={record.id}>
              <GameArtwork record={record} artwork={resolveArtwork?.(record)} />
              <div className="compare-tray-game-copy">
                {onPreview ? (
                  <button
                    type="button"
                    className="text-button compare-tray-game-title"
                    onClick={() => {
                      close();
                      onPreview(record);
                    }}
                  >
                    {record.title}
                  </button>
                ) : (
                  <strong className="compare-tray-game-title">{record.title}</strong>
                )}
                <span>
                  {SOURCE_LABELS[record.source]}
                  {record.year !== null ? ` · ${record.year}` : ''}
                </span>
                <GameArtworkCredit
                  artwork={resolveArtwork?.(record)}
                  disclosureLabel={`Artwork credits for ${record.title}`}
                />
              </div>
              <button
                data-unpin
                type="button"
                className="icon-button"
                aria-label={`Unpin ${record.title} from comparison`}
                onClick={() => remove(record)}
              >
                <Icon name="close" width="19" height="19" />
              </button>
            </li>
          ))}
        </ul>
        <div className="compare-tray-sheet-actions">
          <button
            type="button"
            className="text-button"
            disabled={!items.length && !error}
            onClick={() => {
              clear();
              sheetTitle.current?.focus();
            }}
          >
            Clear all
          </button>
          <button type="button" className="button button-lime" disabled={!items.length} onClick={compare}>
            Choose friends
            <Icon name="arrow" width="18" height="18" />
          </button>
        </div>
      </Dialog>
    </div>
  );
}
