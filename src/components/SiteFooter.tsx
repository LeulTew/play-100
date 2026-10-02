import { author } from '../lib/author';
import { DataUseLink } from './DataUseLink';
import { Icon } from './Icon';
import { AuthorLinks } from './AuthorLinks';

export function SiteFooter({
  onAbout,
  onEffects,
  effects,
}: {
  onAbout?: (opener?: HTMLElement) => void;
  onEffects?: (opener?: HTMLElement) => void;
  effects?: string;
}) {
  return (
    <footer className="site-footer compact-footer" id="site-credits">
      <AuthorLinks className="author-footer" />
      <nav className="footer-tools" aria-label="Resources">
        <a href={author.githubUrl} target="_blank" rel="noopener noreferrer">
          Source code
          <Icon name="up-right" width="15" height="15" />
        </a>
        <a href="/downloads/Play-100-Collection.xlsx" download>
          Enhanced spreadsheet
        </a>
        <a href="/downloads/AAA_games_u_have_to_play_list_top_100.xlsx" download>
          Original spreadsheet
        </a>
        {onAbout ? (
          <button onClick={(event) => onAbout(event.currentTarget)}>About &amp; credits</button>
        ) : (
          <a href="/?info=credits">About &amp; credits</a>
        )}
        <DataUseLink />
        {onEffects && (
          <button onClick={(event) => onEffects(event.currentTarget)}>
            Effects: {effects}
            <Icon name="sliders" width="16" height="16" />
          </button>
        )}
      </nav>
    </footer>
  );
}
