import { useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { Dialog } from '../Dialog';
import { Icon } from '../Icon';
import { GameArtwork, GameArtworkCredit } from '../games/GameArtwork';
import type { GameArtworkProps } from '../games/GameArtwork';
import { useCompareTray } from './compare-tray-context';
import { CompareDragSourceContext } from './compare-drag-source-context';
import './compare-tray.css';

export interface CompareTrayProps {
  onCompare: (records: LibraryRecord[]) => void;
  onPreview?: (record: LibraryRecord) => void;
  resolveArtwork?: (record: LibraryRecord) => GameArtworkProps['artwork'];
  animate?: boolean;
  hidden?: boolean;
}

export function CompareTray(props: CompareTrayProps) {
  const { currentScope } = useCompareTray();
  return <ScopedCompareTray key={currentScope} {...props} />;
}

function ScopedCompareTray({ onCompare, onPreview, resolveArtwork, animate = false, hidden = false }: CompareTrayProps) {
  const { items, unpin, clear, warning, error, persistent, dragging } = useCompareTray();
  const controller = useContext(CompareDragSourceContext);
  const [open, setOpen] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const id = useId();
  const expand = useRef<HTMLButtonElement>(null);
  const sheetTitle = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const newestId = items.at(-1)?.id;
  const dockRef = useCallback((node: HTMLElement | null) => controller?.setDock(node), [controller]);
  const arrivalRef = useCallback((node: HTMLSpanElement | null) => {
    controller?.setArrivalTarget(animate ? newestId : undefined, node);
  }, [controller, newestId, animate]);
  const hasContent = items.length > 0 || Boolean(warning) || Boolean(error);
  const hasTray = hasContent || dragging;
  useEffect(() => {
    const onVisibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const close = () => setOpen(false);
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
  return <>
    {hasTray && !hidden && <div className="compare-tray-reserve" data-error={Boolean(error)} aria-hidden="true" />}
    {hasTray && !hidden && <aside ref={dockRef} className="compare-tray-dock" aria-label="Pinned games for comparison" data-animate={animate && documentVisible ? 'true' : 'false'} data-dragging={dragging} data-has-content={hasContent}
      onDragOver={(event) => controller?.nativeOver(event.nativeEvent)}
      onDrop={(event) => controller?.nativeDrop(event.nativeEvent)}>
      {dragging && <span className="compare-tray-drop-label"><Icon name="plus" width="20" height="20" />Drop to pin for comparison</span>}
      <button ref={expand} type="button" className="compare-tray-expand" aria-label={`Open Compare tray, ${items.length} ${items.length === 1 ? 'game' : 'games'}${persistent ? '' : ', temporary pins'}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="compare-tray-stack" aria-hidden="true">{items.slice(-3).map((record) => <span className="compare-tray-jacket" key={record.id}><span className="compare-tray-jacket-arrival" ref={record.id === newestId ? arrivalRef : undefined}><GameArtwork record={record} artwork={resolveArtwork?.(record)} /></span></span>)}</span>
        <span><strong>{items.length} {items.length === 1 ? 'game' : 'games'}</strong><span>{persistent ? 'Compare tray' : 'Temporary tray'}</span></span>
        <Icon name="up" width="16" height="16" />
      </button>
      <button type="button" className="button button-lime compare-tray-action" aria-label="Compare rankings with friends" disabled={!items.length} onClick={compare}><span>Compare rankings <span className="compare-tray-action-context">with friends</span></span><Icon name="arrow" width="18" height="18" /></button>
      {warning && <span className="compare-tray-storage-mark" aria-label="Tray storage needs attention" title="Open the tray to review its storage warning"><Icon name="info" width="17" height="17" /></span>}
      {error && <p className="compare-tray-error">{error}</p>}
    </aside>}
    <Dialog open={open && !hidden} titleId={`${id}-title`} descriptionId={`${id}-description`} onClose={close} className="compare-tray-sheet">
      <h2 ref={sheetTitle} id={`${id}-title`} tabIndex={-1} data-autofocus>Compare tray</h2>
      <p id={`${id}-description`} className="compare-tray-description">{items.length ? `${items.length} of 6 games. Choose friends to compare their rankings of these games.` : 'Pin a game while browsing to hold it here.'} Pinning does not save, rate or share a game.</p>
      {warning && <div className="compare-tray-warning" role="alert"><p>{warning}</p><button type="button" className="text-button" onClick={() => { clear(); sheetTitle.current?.focus(); }}>Reset saved tray</button></div>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <ul ref={list} className="compare-tray-games" aria-label="Pinned games">
        {items.map((record) => <li key={record.id}>
          <GameArtwork record={record} artwork={resolveArtwork?.(record)} />
          <div className="compare-tray-game-copy">
            {onPreview ? <button type="button" className="text-button compare-tray-game-title" onClick={() => { close(); onPreview(record); }}>{record.title}</button> : <strong className="compare-tray-game-title">{record.title}</strong>}
            <span>{SOURCE_LABELS[record.source]}{record.year !== null ? ` / ${record.year}` : ''}</span>
            <GameArtworkCredit artwork={resolveArtwork?.(record)} disclosureLabel={`Artwork credits for ${record.title}`} />
          </div>
          <button data-unpin type="button" className="icon-button" aria-label={`Unpin ${record.title} from comparison`} onClick={() => remove(record)}><Icon name="close" width="19" height="19" /></button>
        </li>)}
      </ul>
      <div className="compare-tray-sheet-actions">
        <button type="button" className="text-button" disabled={!items.length && !error} onClick={() => { clear(); sheetTitle.current?.focus(); }}>Clear all</button>
        <button type="button" className="button button-lime" disabled={!items.length} onClick={compare}>Choose friends<Icon name="arrow" width="18" height="18" /></button>
      </div>
    </Dialog>
  </>;
}
