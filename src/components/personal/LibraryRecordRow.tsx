import type { CatalogArtwork } from '../../lib/discovery-catalog-shared';
import type { LibraryRecord } from '../../lib/personal-types';
import type { LibraryPageProps } from './LibraryPage';
import { Icon } from '../Icon';
import { PlayedToggle } from '../PlayedToggle';
import { CompletedToggle } from '../CompletedToggle';
import { CompareDragSource } from '../compare-tray/CompareDragSource';
import { RecordIdentity } from './RecordIdentity';

export function LibraryRecordRow({
  record,
  artwork,
  state,
  busy,
  active,
  selecting,
  selected,
  ranked,
  tab,
  onSelect,
  onOpen,
  onPin,
  onUnpin,
  pinnedIds,
  renderDragHandle,
  onAction,
  requestRemoval,
}: Pick<
  LibraryPageProps,
  'state' | 'busy' | 'onOpen' | 'onPin' | 'onUnpin' | 'pinnedIds' | 'renderDragHandle' | 'onAction'
> & {
  record: LibraryRecord;
  artwork?: CatalogArtwork;
  active: boolean;
  selecting: boolean;
  selected: boolean;
  ranked: boolean;
  tab: 'later' | 'completed' | 'all';
  onSelect: (id: string) => void;
  requestRemoval: (records: LibraryRecord[], trigger: HTMLElement) => void;
}) {
  return (
    <CompareDragSource record={record} disabled={!active}>
      {(binding) => (
        <div ref={binding.sourceRef} {...binding.surfaceProps} className="library-row-content">
          {selecting && (
            <label className="select-control">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onSelect(record.id)}
                aria-label={`Select ${record.title}`}
              />
            </label>
          )}
          <RecordIdentity record={record} artwork={artwork} onOpen={onOpen} compareDrag={binding} />
          <div className="record-actions">
            {onPin && (
              <button
                className="text-button"
                disabled={pinnedIds?.has(record.id) && !onUnpin}
                aria-pressed={onUnpin ? (pinnedIds?.has(record.id) ?? false) : undefined}
                aria-label={`${pinnedIds?.has(record.id) && !onUnpin ? 'Pinned' : 'Pin'} for comparison: ${record.title}`}
                title={`${pinnedIds?.has(record.id) && !onUnpin ? 'Pinned' : 'Pin'} for comparison`}
                onClick={() => {
                  if (pinnedIds?.has(record.id)) onUnpin?.(record.id);
                  else onPin(record);
                }}
              >
                <Icon name="stack" width="19" height="19" fill={pinnedIds?.has(record.id) ? 'currentColor' : 'none'} />
                Pin
              </button>
            )}
            {renderDragHandle?.(record)}
            <PlayedToggle
              id={record.id}
              title={record.title}
              played={Boolean(state.progress[record.id]?.played)}
              completed={state.progress[record.id]?.completed}
              busy={busy}
              compact
              onChange={(value) => {
                void onAction({ type: 'set-progress', records: [record], key: 'played', value });
              }}
            />
            <CompletedToggle
              title={record.title}
              completed={Boolean(state.progress[record.id]?.completed)}
              busy={busy}
              onChange={(value) => {
                void onAction({ type: 'set-progress', records: [record], key: 'completed', value });
              }}
            />
            {tab !== 'later' && (
              <button
                className="icon-button"
                disabled={busy}
                aria-pressed={Boolean(state.progress[record.id]?.later)}
                aria-label={`Play later: ${record.title}`}
                title="Play later"
                onClick={() => {
                  void onAction({ type: 'toggle-progress', record, key: 'later' });
                }}
              >
                <Icon
                  name="bookmark"
                  width="19"
                  height="19"
                  fill={state.progress[record.id]?.later ? 'currentColor' : 'none'}
                />
              </button>
            )}
            <span className="record-tail">
              <button
                className="text-button"
                disabled={busy || ranked}
                aria-label={`Add ${record.title} to my ranking`}
                onClick={() => {
                  void onAction({ type: 'add-ranking', records: [record] });
                }}
              >
                <Icon name="rank" width="20" height="20" />
                Rank
              </button>
              <button
                className="icon-button remove-library-action"
                disabled={busy}
                aria-label={
                  tab === 'later' ? `Remove from Play later: ${record.title}` : `Remove ${record.title} from my library`
                }
                title={tab === 'later' ? 'Remove from Play later' : undefined}
                onClick={(event) => {
                  if (tab === 'later') {
                    void onAction({ type: 'set-progress', records: [record], key: 'later', value: false });
                  } else requestRemoval([record], event.currentTarget);
                }}
              >
                <Icon name="trash" width="19" height="19" />
              </button>
            </span>
          </div>
          <span className={`play-state ${state.progress[record.id]?.completed ? 'state-completed' : ''}`}>
            {state.progress[record.id]?.completed
              ? 'Completed'
              : state.progress[record.id]?.played
                ? 'Played, not completed'
                : 'Not played'}
          </span>
        </div>
      )}
    </CompareDragSource>
  );
}
