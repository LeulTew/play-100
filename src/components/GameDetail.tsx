import { useEffect, useRef } from 'react';
import type { Game, GameProgress } from '../lib/types';
import { criticColumns, formatAverage } from '../lib/collection';
import { Dialog } from './Dialog';
import { GameCover } from './GameCover';
import { Icon } from './Icon';
import { PlayedToggle } from './PlayedToggle';
import { author, authorRatingText } from '../lib/author';
import { PersonalRatingInput } from './personal/PersonalRatingInput';
import { useLibraryMode } from '../lib/library-mode';

interface GameDetailProps {
  game: Game;
  state: GameProgress | undefined;
  previous: Game | undefined;
  next: Game | undefined;
  onClose: () => void;
  onOpen: (slug: string) => void;
  onToggle: (slug: string, key: 'later' | 'completed', value?: boolean) => void;
  onShare: () => void;
  shareFeedback: string;
  busy?: boolean;
  played?: boolean;
  rankingPosition?: number | null;
  onPlayed?: (value: boolean) => void;
  onRank?: () => void;
  personalRating: number | null;
  onRate: (score: number | null) => Promise<boolean>;
}

export function GameDetail({ game, state, previous, next, onClose, onOpen, onToggle, onShare, shareFeedback, busy, played, rankingPosition, onPlayed, onRank, personalRating, onRate }: GameDetailProps) {
  const mode = useLibraryMode();
  const topRef = useRef<HTMLDivElement>(null);
  const lastSlug = useRef(game.slug);
  useEffect(() => {
    if (lastSlug.current !== game.slug) {
      topRef.current?.closest('dialog')?.scrollTo({ top: 0, behavior: 'instant' });
      topRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
      lastSlug.current = game.slug;
    }
  }, [game.slug]);
  return (
    <Dialog open titleId="game-title" onClose={onClose} className="game-dialog">
      <div className="detail-top" ref={topRef}>
        <div className="detail-place"><span>#{String(game.rank).padStart(2, '0')} in the collection</span><span>{game.tier === 'core' ? 'Core 50' : 'Essential 50'}</span></div>
        <h2 id="game-title" tabIndex={-1} data-autofocus>{game.title}</h2>
        <p className="detail-byline">{game.year}<span> / </span>{game.studio}</p>
        <div className="author-rating-detail"><div><strong>{author.shortName}'s original rating</strong><p>Workbook rank-based rating.</p></div><span title={game.authorRating?.rawValue}>{authorRatingText(game.authorRating)}{game.authorRating && <small> / 10</small>}</span></div>
        <div className="detail-cover"><GameCover key={game.slug} game={game} large eager /></div>
        <p className="art-caption">{game.artwork ? 'Workbook thumbnail' : 'Play 100 artwork'}</p>
        {game.slug === 'hitman-world-of-assassination' && <p className="source-note">Source caveat: the workbook calls this "Hitman: World of Assassination", lists 2016 and supplies HITMAN III-branded artwork. We preserve all three rather than infer a release or edition.</p>}
        <p className="detail-genre">{game.genre}</p>
        <div className="detail-actions">
          <button className={`button ${state?.later ? 'button-lime' : 'button-dark'}`} disabled={busy} aria-pressed={Boolean(state?.later)} onClick={() => onToggle(game.slug, 'later')}>
            <Icon name="bookmark" />{state?.later ? 'Saved for later' : 'Play later'}
          </button>
          <button className="button button-outline" disabled={busy} aria-pressed={Boolean(state?.completed)} onClick={() => onToggle(game.slug, 'completed', !state?.completed)}>
            <Icon name="check" />{state?.completed ? 'Completed' : 'Mark completed'}
          </button>
          <button className="icon-button share-detail" aria-label={`Share ${game.title}`} onClick={onShare}><Icon name="share" /></button>
        </div>
        <p className="device-note">{mode.scope === 'guest' ? 'Guest progress stays on this device.' : 'Account progress. See Account for sync status.'}</p>
        {onRank && <div className="personal-detail-actions">{onPlayed && <PlayedToggle id={game.slug} title={game.title} played={Boolean(played)} completed={state?.completed} busy={busy} onChange={onPlayed} />}<button className="text-button" disabled={busy} onClick={onRank}><Icon name="rank" width="18" height="18" />{rankingPosition ? `Your rank: #${rankingPosition}` : 'Add to my ranking'}</button></div>}
        <div className="catalog-detail-rating"><PersonalRatingInput key={game.slug} title={game.title} value={personalRating} busy={Boolean(busy)} onCommit={onRate} /><p>Rating adds to My rankings without marking played or moving a fixed position.</p></div>
        {shareFeedback && <p className="detail-share-notice" role="status">{shareFeedback}</p>}
      </div>
      <section className="detail-section">
        <h3>Why it made the list</h3>
        <p className="rationale">{game.rationale}</p>
        {game.sourceNote && <div className="source-note"><Icon name="info" /><p><strong>From the source workbook</strong><br />{game.sourceNote}</p></div>}
      </section>
      <section className="detail-section critic-section">
        <div className="section-title-line"><h3>Critic scores</h3><div className="average"><strong>{formatAverage(game.criticAverage)}</strong>{game.criticAverage !== null && <span> / 100</span>}</div></div>
        <p className="section-help">Workbook snapshot. Not live or independently verified.</p>
        <dl className="critic-scores">
          {criticColumns.map(({ key, label, scale }) => (
            <div key={key}><dt>{label}</dt><dd>{game.critics[key] === null ? <span className="score-missing">Unavailable</span> : <><strong>{game.critics[key]}</strong><span> / {scale}</span></>}</dd></div>
          ))}
        </dl>
        <details className="methodology-details">
          <summary>Score sources &amp; method<Icon name="down" width="18" height="18" /></summary>
          <p>The displayed average normalizes every available entered score to 100, then averages those columns. General and PC Metacritic each count when both are present. Missing scores are excluded. This is not an official aggregate or an average of independent publications.</p>
          <p>{author.shortName}'s original rating is preserved separately from those critics. The source column was headed "my rating(based on rank)"; its actual cached number is used, including any rounded text result, not a reconstructed curve. {game.authorRating && <>Original cached value: <strong>{game.authorRating.rawValue}</strong>.</>}</p>
          <p>Your rating belongs to the active library, never prefilled from {author.shortName}'s. Public sharing requires a separate preview and publish action.</p>
        </details>
      </section>
      <nav className="detail-pagination" aria-label="Games in the collection">
        <button className="text-button" disabled={!previous} onClick={() => previous && onOpen(previous.slug)}><Icon name="back" />Previous game</button>
        <span>{game.rank} / 100</span>
        <button className="text-button" disabled={!next} onClick={() => next && onOpen(next.slug)}>Next game<Icon name="arrow" /></button>
      </nav>
    </Dialog>
  );
}
