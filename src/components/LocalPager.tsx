import { getLocalPage } from '../lib/local-pagination';
import './local-pager.css';

export interface LocalPagerProps {
  total: number;
  pageSize: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  disabled?: boolean;
  label?: string;
  itemLabel?: string;
}

export function LocalPager({ total, pageSize, offset, onOffsetChange, disabled = false, label = 'Result pages', itemLabel = 'games' }: LocalPagerProps) {
  const current = getLocalPage(total, pageSize, offset);
  const first = current.page <= 1;
  const last = current.page >= current.pageCount;
  return (
    <nav className="local-pager" aria-label={label}>
      <div className="local-pager-controls">
        <button type="button" className="button button-outline" disabled={disabled || first} onClick={() => onOffsetChange(0)}>First</button>
        <button type="button" className="button button-outline" disabled={disabled || first} onClick={() => onOffsetChange(current.offset - pageSize)}>Previous</button>
        <label className="local-pager-choice">Page
          <select aria-label={`${label}: page`} value={current.page} disabled={disabled || current.pageCount < 2} onChange={(event) => onOffsetChange((Number(event.target.value) - 1) * pageSize)}>
            {current.pageCount ? Array.from({ length: current.pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} of {current.pageCount}</option>) : <option value={0}>0 of 0</option>}
          </select>
        </label>
        <button type="button" className="button button-outline" disabled={disabled || last} onClick={() => onOffsetChange(current.offset + pageSize)}>Next</button>
        <button type="button" className="button button-outline" disabled={disabled || last} onClick={() => onOffsetChange((current.pageCount - 1) * pageSize)}>Last</button>
      </div>
      <p>{current.start}–{current.end} of {total} {itemLabel}</p>
    </nav>
  );
}
