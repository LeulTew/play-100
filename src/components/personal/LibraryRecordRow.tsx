import type { CatalogArtwork } from '../../lib/discovery-catalog-shared';
import type { LibraryRecord } from '../../lib/personal-types';
import type { LibraryPageProps } from './LibraryPage';
import { Icon } from '../Icon';
import { PlayedToggle } from '../PlayedToggle';
import { CompletedToggle } from '../CompletedToggle';
import { CompareDragSource } from '../compare-tray/CompareDragSource';
import { ComparePinButton } from '../compare-tray/ComparePinButton';
import { RecordIdentity } from './RecordIdentity';

export function LibraryRecordRow({
  record,
  artwork,
  state,
  busy,
  active,
  selecting,
  selected,
  rankingPosition,
  tab,
  onSelect,
  onOpen,
  onPin,
  onUnpin,
  pinnedIds,
  onAction,
  onPresentationChange,
  requestRemoval,
  removeFromQueue,
}: Pick<
  LibraryPageProps,
  'state' | 'busy' | 'onOpen' | 'onPin' | 'onUnpin' | 'pinnedIds' | 'onAction' | 'onPresentationChange'
> & {
  record: LibraryRecord;
  artwork?: CatalogArtwork;
  active: boolean;
  selecting: boolean;
  selected: boolean;
  rankingPosition?: number;
  tab: 'later' | 'completed' | 'all';
  onSelect: (id: string) => void;
  requestRemoval: (records: LibraryRecord[], trigger: HTMLElement) => void;
  removeFromQueue: (record: LibraryRecord, trigger: HTMLElement) => Promise<void>;
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
              <ComparePinButton
                record={record}
                variant="text"
                pinned={pinnedIds?.has(record.id)}
                onPin={onPin}
                onUnpin={onUnpin}
                disabled={!active || selecting}
              />
            )}
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
                aria-disabled={busy || undefined}
                aria-pressed={Boolean(state.progress[record.id]?.later)}
                aria-label={`Play later: ${record.title}`}
                title="Play later"
                onClick={() => {
                  if (!busy) void onAction({ type: 'toggle-progress', record, key: 'later' });
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
              {rankingPosition ? (
                <a
                  className="text-button"
                  href={`/my-games?tab=ranking#${new URLSearchParams({ rank: record.id })}`}
                  aria-label={`Ranked #${rankingPosition}: ${record.title}. Open in Ranking`}
                  aria-disabled={busy || undefined}
                  onClick={(event) => {
                    if (busy) {
                      event.preventDefault();
                      return;
                    }
                    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
                    event.preventDefault();
                    const destination = event.currentTarget.href;
                    void onPresentationChange(() => location.assign(destination));
                  }}
                >
                  Ranked #{rankingPosition}
                </a>
              ) : (
                <button
                  className="text-button"
                  aria-disabled={busy || undefined}
                  aria-label={`Add ${record.title} to my ranking`}
                  onClick={() => {
                    if (!busy) void onAction({ type: 'add-ranking', records: [record] });
                  }}
                >
                  <Icon name="rank" width="20" height="20" />
                  Rank
                </button>
              )}
              <button
                className="icon-button remove-library-action"
                aria-disabled={busy || undefined}
                aria-label={
                  tab === 'later' ? `Remove from Play later: ${record.title}` : `Remove ${record.title} from my library`
                }
                title={tab === 'later' ? 'Remove from Play later' : undefined}
                onClick={(event) => {
                  if (busy) return;
                  if (tab === 'later') {
                    void removeFromQueue(record, event.currentTarget);
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
