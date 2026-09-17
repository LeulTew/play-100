import { author } from '../lib/author';
import { DataUseLink } from './DataUseLink';
import { Icon } from './Icon';

export function SiteFooter({ onAbout, onEffects, effects }: { onAbout?: () => void; onEffects?: () => void; effects?: string }) {
  return <footer className="site-footer compact-footer" id="site-credits">
    <div className="author-footer"><p>Curated by <strong>{author.fullName}</strong></p><nav aria-label="Creator links">
      <a href={author.githubUrl} target="_blank" rel="noopener noreferrer">GitHub<Icon name="up-right" width="15" height="15" /></a>
      <a href={author.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn<Icon name="up-right" width="15" height="15" /></a>
      <a href={author.telegramUrl} target="_blank" rel="noopener noreferrer">Telegram {author.telegramHandle}<Icon name="up-right" width="15" height="15" /></a>
    </nav></div>
    <nav className="footer-tools" aria-label="Resources">
      <a href="/downloads/Play-100-Collection.xlsx" download>Enhanced spreadsheet</a>
      <a href="/downloads/AAA_games_u_have_to_play_list_top_100.xlsx" download>Original spreadsheet</a>
      {onAbout ? <button onClick={onAbout}>About &amp; credits</button> : <a href="/?info=credits">About &amp; credits</a>}
      <DataUseLink />
      {onEffects && <button onClick={onEffects}>Effects: {effects}<Icon name="sliders" width="16" height="16" /></button>}
    </nav>
  </footer>;
}
