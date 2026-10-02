import author from '../../author.json';
import type { AuthorRating } from './types';

export { author };

export const authorLinks = [
  ['github', 'GitHub', author.githubProfileUrl],
  ['linkedin', 'LinkedIn', author.linkedinUrl],
  ['telegram', `Telegram, ${author.telegramHandle}`, author.telegramUrl],
  ['email', 'Email', `mailto:${author.email}`],
] as const;

export function authorRatingText(rating: AuthorRating | null): string {
  if (!rating) return 'Unavailable';
  const exactDisplay = /^\s*([+-]?\d+(?:\.\d+)?)/.exec(rating.display)?.[1];
  return exactDisplay ?? String(rating.value);
}
