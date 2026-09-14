import { useState } from 'react';
import type { CSSProperties } from 'react';
import { artworkUrl } from '../lib/collection';
import type { Game } from '../lib/types';
import coverMetadata from '../generated/cover-metadata.json';

export function GameCover({ game, large = false, eager = false }: { game: Game; large?: boolean; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const source = artworkUrl(game);
  const metadata: Record<string, { width: number; height: number }> = coverMetadata;
  const dimensions = metadata[game.slug];
  const variant = game.rank % 5;
  return (
    <div className={`game-cover jacket-${variant} ${large ? 'large-jacket' : ''} ${source && !failed ? 'has-cover' : 'original-jacket'}`} data-artwork={source && !failed ? 'workbook' : 'original'}>
          <svg className="jacket-drawing" viewBox="0 0 480 320" aria-hidden="true">
            {variant === 0 && <g fill="none" stroke="currentColor" strokeWidth="28"><path d="m95 340 190-390m-100 390 190-390m-100 390L465-50" /><circle cx="120" cy="145" r="77" /></g>}
            {variant === 1 && <g fill="none" stroke="currentColor" strokeWidth="2">{[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M${90 + i * 17} 295V${80 + i * 9}l135-63 130 70v200l-130-67Z`} />)}</g>}
            {variant === 2 && <g fill="currentColor"><path d="m280-15 125 75-120 220-125-75Z" /><path opacity=".3" d="m350-15 125 75-120 220-125-75Z" /><path opacity=".15" d="m210-15 125 75-120 220-125-75Z" /></g>}
            {variant === 3 && <g fill="none" stroke="currentColor" strokeWidth="2">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <ellipse key={i} cx={265 + i * 5} cy={145 + i * 7} rx={60 + i * 13} ry={32 + i * 10} transform="rotate(-34 265 145)" />)}</g>}
            {variant === 4 && <g fill="currentColor"><path d="M240 40h155v40H280v160h115v40H240Z" /><path opacity=".45" d="M180 40h40v240h-40z" /><path opacity=".22" d="M120 40h40v240h-40z" /></g>}
          </svg>
          <span className="jacket-series" aria-hidden="true">PLAY / {String(game.rank).padStart(3, '0')}</span>
          <span className="jacket-year" aria-hidden="true">{game.year}</span>
          {source && !failed && dimensions && <img src={source} width={dimensions.width} height={dimensions.height} style={{ '--cover-width': `${dimensions.width}px`, '--cover-height': `${dimensions.height}px` } as CSSProperties} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />}
          {failed && <span className="art-fallback-note">Cover unavailable · collection artwork</span>}
      <span className="cover-rank" aria-hidden="true">{String(game.rank).padStart(2, '0')}</span>
    </div>
  );
}
