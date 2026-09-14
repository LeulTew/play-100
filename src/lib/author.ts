import author from '../../author.json';
import type { AuthorRating } from './types';

export { author };

export function authorRatingText(rating: AuthorRating | null): string {
  if (!rating) return 'Unavailable';
  const exactDisplay = /^\s*([+-]?\d+(?:\.\d+)?)/.exec(rating.display)?.[1];
  return exactDisplay ?? String(rating.value);
}
