import type { Filters, Game } from '../lib/types';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { LibraryRecord, PersonalProgress } from '../lib/personal-types';
import { createSearch } from '../lib/url';
import { formatAverage } from '../lib/collection';
import { GameCover } from './GameCover';
import { Icon } from './Icon';
import { PlayedToggle } from './PlayedToggle';
import { CompletedToggle } from './CompletedToggle';
import { author, authorRatingText } from '../lib/author';
import { useMotionRuntime } from '../motion';
import type { MotionOriginHint } from '../motion';
import { useCompareDragSource } from './compare-tray/useCompareDragSource';

interface GameCardProps {
  game: Game;
  filters: Filters;
  state: PersonalProgress | undefined;
  onOpen: (slug: string, origin?: MotionOriginHint) => void;
  onSave: (slug: string) => void;
  onPlayed: (slug: string, value: boolean) => void;
  onCompleted: (slug: string, value: boolean) => void;
  eager?: boolean;
  selecting?: boolean;
  selected?: boolean;
  busy?: boolean;
  onSelect?: (id: string) => void;
  compareRecord?: LibraryRecord;
  compareActions?: ReactNode;
  savedCopies?: ReactNode;
}

export function GameCard({ game, filters, state, onOpen, onSave, onPlayed, onCompleted, eager, selecting, selected, busy, onSelect, compareRecord, compareActions, savedCopies }: GameCardProps) {
  const motion = useMotionRuntime();
  const sourceRef = useRef<HTMLElement>(null);
  const compareDrag = useCompareDragSource({ record: compareRecord, sourceRef });
  return (
    <article ref={sourceRef} {...compareDrag.surfaceProps} role="listitem" className={`game-card ${state?.completed ? 'is-completed' : ''} ${selected ? 'card-selected' : ''}`} data-game={game.slug}>
      <a
        {...compareDrag.titleProps}
        href={`/${createSearch(filters, game.slug)}`}
        className="game-link"
        onClick={(event) => {
          if (event.defaultPrevented || compareDrag.consumeClick(event)) return;
          if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          const source = event.currentTarget.querySelector<HTMLElement>('.game-cover');
          const origin = source ? motion.originHint({
            surface: 'collection',
            presentationId: game.slug,
            source,
            trigger: event.currentTarget,
            visual: { kind: 'jacket', rank: game.rank },
          }) : null;
          onOpen(game.slug, origin ?? undefined);
        }}
      >
        <span className="sr-only">Number {game.rank} in the author's collection. </span>
        <GameCover game={game} eager={eager} />
        <div className="game-copy">
          <div className="game-meta"><span>{game.year}</span><span className="meta-dot" /><span>{game.tier === 'core' ? 'Core 50' : 'Essential 50'}</span></div>
          <h3>{game.title}<Icon name="up-right" /></h3>
          <p className="author-rating-card" title={game.authorRating ? `Original ${game.authorRating.sourceCell}: ${game.authorRating.rawValue}` : 'This cached collection copy does not include the original author rating.'}>{author.shortName}'s rating <strong>{authorRatingText(game.authorRating)}</strong>{game.authorRating && <span> / 10</span>}</p>
          <p className="game-genre">{game.genre}</p>
          <span className="list-score">{formatAverage(game.criticAverage)}<span> snapshot avg.</span></span>
          {state?.completed && <span className="completed-marker"><Icon name="check" width="15" height="15" /> Completed</span>}
        </div>
      </a>
      <div className="card-played"><PlayedToggle id={game.slug} title={game.title} played={Boolean(state?.played)} completed={state?.completed} busy={busy} compact onChange={value => onPlayed(game.slug, value)} /><CompletedToggle title={game.title} completed={Boolean(state?.completed)} busy={busy} onChange={value => onCompleted(game.slug, value)} />{compareActions && <div className="card-compare-actions">{compareActions}</div>}</div>
      {savedCopies}
      {selecting && <label className="select-control card-selection"><input type="checkbox" checked={Boolean(selected)} onChange={() => onSelect?.(game.slug)} aria-label={`Select ${game.title}`} /></label>}
      <button
        className={`save-game icon-button ${state?.later ? 'is-saved' : ''}`}
        aria-pressed={Boolean(state?.later)}
        aria-label={`Play later: ${game.title}`}
        title="Play later"
        disabled={busy}
        onClick={() => onSave(game.slug)}
      >
        <Icon name="bookmark" fill={state?.later ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}
