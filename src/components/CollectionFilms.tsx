import { useEffect, useId, useRef, useState } from 'react';
import { collectionFilms, filmDuration, unloadFilm } from '../lib/films';
import type { CollectionFilm } from '../lib/films';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import './collection-films.css';

function FilmPoster({ film }: { film: CollectionFilm }) {
  const [failed, setFailed] = useState(false);
  return <span className="film-poster">
    {failed ? <span className="film-poster-fallback">Poster unavailable</span> :
      <img src={film.poster.src} width={film.poster.width} height={film.poster.height} loading="lazy" decoding="async" alt="" onError={() => setFailed(true)} />}
    <span className="film-play-mark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 20 20"><path d="M6 3 17 10 6 17Z" fill="currentColor" /></svg></span>
  </span>;
}

function FilmVideo({ film, onRetry }: { film: CollectionFilm; onRetry: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    if (player.getAttribute('src') !== film.video.src) player.setAttribute('src', film.video.src);
    const pause = () => { if (document.hidden) player.pause(); };
    document.addEventListener('visibilitychange', pause);
    return () => { document.removeEventListener('visibilitychange', pause); unloadFilm(player); };
  }, [film.video.src]);
  return <div className="film-media">
    <video ref={video} src={film.video.src} poster={film.poster.src} width={film.poster.width} height={film.poster.height}
      controls playsInline preload="metadata" aria-label={`${film.title} film`}
      onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)}
      onPlaying={() => setWaiting(false)} onError={() => { setFailed(true); setWaiting(false); }}>
      <track kind="captions" src={film.captions} srcLang="en" label="English (sound)" />
      Your browser does not support this video. Use Download film or read the transcript below.
    </video>
    {waiting && !failed && <p role="status">Buffering film...</p>}
    {failed && <div className="film-error" role="alert"><p>The film could not load. Check your connection or download it instead.</p><button className="button button-outline" onClick={onRetry}>Retry film</button></div>}
  </div>;
}

export default function CollectionFilms() {
  const [active, setActive] = useState<CollectionFilm | null>(null);
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const close = () => setActive(null);
  useEffect(() => { if (active) heading.current?.focus({ preventScroll: true }); }, [active, attempt]);
  useEffect(() => {
    const leave = () => setActive(null);
    window.addEventListener('popstate', leave); window.addEventListener('play100:navigate', leave); window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('popstate', leave); window.removeEventListener('play100:navigate', leave); window.removeEventListener('pagehide', leave); };
  }, []);
  return <section id="collection-films" className="collection-films" aria-labelledby="collection-films-title">
    <div className="films-heading"><h2 id="collection-films-title" tabIndex={-1}>Watch films</h2><p>Short tours. Play only when you choose.</p></div>
    <ul className="films-list">{collectionFilms.map((film) => <li key={film.id}>
      <button className="film-watch" aria-label={`Watch ${film.title}, ${film.durationSeconds} seconds`} aria-haspopup="dialog" onClick={() => { setAttempt(0); setActive(film); }}>
        <FilmPoster film={film} />
        <span className="film-summary"><strong>{film.title}</strong><span>{film.description}</span><small>{filmDuration(film.durationSeconds)} · Watch film</small></span>
      </button>
    </li>)}</ul>
    {active && <Dialog open titleId={titleId} className="film-dialog" onClose={close}>
      <h2 ref={heading} id={titleId} data-autofocus tabIndex={-1}>{active.title}</h2>
      <p className="film-intro">{filmDuration(active.durationSeconds)}. Native playback controls. Instrumental music and interface sounds; no narration.</p>
      <FilmVideo key={`${active.id}:${attempt}`} film={active} onRetry={() => setAttempt((value) => value + 1)} />
      <div className="film-player-actions">
        <a className="text-button" href={active.video.src} download={`Play-100-${active.id}.mp4`}><Icon name="download" width="18" height="18" />Download film <span>({(active.video.bytes / 1000000).toFixed(1)} MB)</span></a>
        {collectionFilms.filter((film) => film.id !== active.id).map((film) => <button key={film.id} className="text-button" onClick={() => { setAttempt(0); setActive(film); }}>Watch {film.title}<Icon name="arrow" width="18" height="18" /></button>)}
      </div>
      <details className="film-details"><summary>Text alternative & credits</summary>
        <p>{active.context}</p>
        <dl>{active.transcript.map((cue) => <div key={cue.time}><dt>{cue.time}</dt><dd>{cue.text}</dd></div>)}</dl>
        <p>Curated by Leul Tewodros Agonafer. Original instrumental music; Kenney UI Audio clicks (CC0). Game names and imagery belong to their respective owners; no endorsement is implied.</p>
        <div className="button-row"><a className="text-button" href={active.transcriptFile} download={`Play-100-${active.id}-transcript.txt`}>Download text alternative<Icon name="download" width="18" height="18" /></a><a className="text-button" href={active.credits} download={`Play-100-${active.id}-credits.md`}>Full source & media credits<Icon name="download" width="18" height="18" /></a></div>
      </details>
    </Dialog>}
  </section>;
}
