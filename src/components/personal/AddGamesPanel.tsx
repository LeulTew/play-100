import { useMemo, useState } from 'react';
import type { LibraryRecord } from '../../lib/personal-types';
import { SOURCE_LABELS } from '../../lib/personal-types';
import { searchText } from '../../lib/collection';
import { catalogPickerChoices } from '../../lib/catalog-identity';
import { Icon } from '../Icon';
import ManualGameForm from './ManualGameForm';

export default function AddGamesPanel({
  records,
  ownedRecords,
  existingIds,
  onAdd,
  onDiscover,
  busy,
  kind = 'ranking',
}: {
  records: LibraryRecord[];
  ownedRecords: Record<string, LibraryRecord>;
  existingIds: ReadonlySet<string>;
  onAdd: (records: LibraryRecord[]) => Promise<boolean>;
  onDiscover: () => void;
  busy: boolean;
  kind?: 'ranking' | 'library';
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const candidates = useMemo(() => catalogPickerChoices(records, ownedRecords), [records, ownedRecords]);
  const choices = useMemo(() => {
    const term = searchText(query);
    return candidates
      .filter((choice) => choice.titles.some((title) => searchText(title).includes(term)))
      .slice(0, query ? 20 : 6);
  }, [candidates, query]);
  return (
    <section className="add-games-panel">
      <button className="button button-outline" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <Icon name={expanded ? 'close' : 'plus'} width="18" height="18" />
        {expanded ? 'Close game picker' : 'Add games'}
      </button>
      {expanded && (
        <div className="game-picker">
          <label htmlFor={`add-${kind}-search`}>Find a game from the 100 or your library</label>
          <div className="search-field">
            <Icon name="search" width="18" height="18" />
            <input
              id={`add-${kind}-search`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your available games…"
              maxLength={160}
            />
          </div>
          <ul className="picker-results">
            {choices.map(({ record }) => {
              const existing = existingIds.has(record.id);
              return (
                <li key={record.id} data-picker-id={record.id}>
                  <div>
                    <strong>{record.title}</strong>
                    <span>
                      {SOURCE_LABELS[record.source]}
                      {record.year ? ` · ${record.year}` : ''}
                      {existing ? (kind === 'ranking' ? ' · Already ranked' : ' · Already in library') : ''}
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={existing ? `Already in ${kind}: ${record.title}` : `Add ${record.title} to ${kind}`}
                    disabled={busy || existing}
                    onClick={() => {
                      void onAdd([record]);
                    }}
                  >
                    <Icon name={existing ? 'check' : 'plus'} width="18" height="18" />
                  </button>
                </li>
              );
            })}
          </ul>
          {!choices.length && <p>No match in these games. Discover more or add your own title below.</p>}
          {!query && <p className="section-help">Up to six suggestions. Search to find another title.</p>}
          <button className="text-button" onClick={onDiscover}>
            Discover games beyond the 100
            <Icon name="arrow" width="17" height="17" />
          </button>
          <ManualGameForm
            busy={busy}
            onAdd={(record) => onAdd([record])}
            actionLabel={kind === 'ranking' ? 'Add to my ranking' : 'Add to my library'}
          />
        </div>
      )}
    </section>
  );
}
