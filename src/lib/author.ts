import {
  fullName,
  shortName,
  githubUrl,
  githubProfileUrl,
  linkedinUrl,
  telegramHandle,
  telegramUrl,
  email,
} from '../../author.json';
import type { AuthorRating } from './types';

export const author = {
  fullName,
  shortName,
  githubUrl,
  githubProfileUrl,
  linkedinUrl,
  telegramHandle,
  telegramUrl,
  email,
};

export const authorLinks = [
  ['github', `${shortName} on GitHub (opens in a new tab)`, githubProfileUrl],
  ['linkedin', `${shortName} on LinkedIn (opens in a new tab)`, linkedinUrl],
  ['telegram', `${shortName} on Telegram, ${telegramHandle} (opens in a new tab)`, telegramUrl],
  ['email', `Email ${shortName} at ${email}`, `mailto:${email}`],
] as const;

export function authorRatingText(rating: AuthorRating | null): string {
  if (!rating) return 'Unavailable';
  const exactDisplay = /^\s*([+-]?\d+(?:\.\d+)?)/.exec(rating.display)?.[1];
  return exactDisplay ?? String(rating.value);
}
