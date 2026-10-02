/**
 * A film's poster frame before its artwork shows: a title card numbered like the game jackets (jacket-series). A
 * constrained device keeps it until the films are used (CollectionPage). Decorative: the opener's summary names the
 * film.
 */
export function FilmPosterCard({ number, title }: { number: number; title: string }) {
  return (
    <span className="film-poster-card" aria-hidden="true">
      <span className="jacket-series">FILM / {String(number).padStart(2, '0')}</span>
      <strong>{title}</strong>
    </span>
  );
}
