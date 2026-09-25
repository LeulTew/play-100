import type { CatalogArtwork } from '../lib/discovery-catalog';
import type { LibraryRecord } from '../lib/personal-types';
import { GameArtworkCredit } from '../components/games/GameArtwork';

export function ShelfArtworkCredits({
  records,
  artwork,
}: {
  records: readonly Pick<LibraryRecord, 'id' | 'title'>[];
  artwork?: ReadonlyMap<string, CatalogArtwork>;
}) {
  const seen = new Set<string>();
  const credits = records.flatMap((record) => {
    const image = artwork?.get(record.id);
    if (!image || seen.has(image.src)) return [];
    seen.add(image.src);
    return [{ record, image }];
  });
  if (!credits.length) return null;
  return (
    <details className="shelf-artwork-credits">
      <summary>Artwork credits</summary>
      <ul>
        {credits.map(({ record, image }) => (
          <li key={image.src}>
            <strong>{record.title}</strong>
            <GameArtworkCredit artwork={image} />
          </li>
        ))}
      </ul>
    </details>
  );
}
