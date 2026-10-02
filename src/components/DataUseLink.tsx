import { Icon } from './Icon';

export function DataUseLink() {
  return (
    <a className="data-use-link" href="/data-use" target="_blank" rel="noopener noreferrer">
      Data use <Icon name="up-right" width="16" height="16" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
