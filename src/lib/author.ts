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
  ['github', `${shortName} on GitHub`, githubProfileUrl],
  ['linkedin', `${shortName} on LinkedIn`, linkedinUrl],
  ['telegram', `${shortName} on Telegram, ${telegramHandle}`, telegramUrl],
  ['email', `Email ${shortName} at ${email}`, `mailto:${email}`],
] as const;

export function authorRatingText(rating: AuthorRating | null): string {
  if (!rating) return 'Unavailable';
  const exactDisplay = /^\s*([+-]?\d+(?:\.\d+)?)/.exec(rating.display)?.[1];
  return exactDisplay ?? String(rating.value);
}
