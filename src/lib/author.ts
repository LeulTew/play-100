import author from '../../author.json';
import type { AuthorRating } from './types';

export { author };

export const authorLinks = [
  ['github', `${author.shortName} on GitHub`, author.githubProfileUrl],
  ['linkedin', `${author.shortName} on LinkedIn`, author.linkedinUrl],
  ['telegram', `${author.shortName} on Telegram, ${author.telegramHandle}`, author.telegramUrl],
  ['email', `Email ${author.shortName} at ${author.email}`, `mailto:${author.email}`],
] as const;

export function authorRatingText(rating: AuthorRating | null): string {
  if (!rating) return 'Unavailable';
  const exactDisplay = /^\s*([+-]?\d+(?:\.\d+)?)/.exec(rating.display)?.[1];
  return exactDisplay ?? String(rating.value);
}
