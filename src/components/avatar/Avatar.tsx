import { useMemo } from 'react';
import { generateAvatarDataUri, parseAvatarDescriptor } from '../../lib/avatar';
import type { AvatarDescriptor } from '../../lib/avatar';
import './avatar.css';

export interface AvatarProps {
  descriptor: AvatarDescriptor;
  size?: number;
  className?: string;
  /** Leave empty beside a username; supply a meaningful label for standalone images. */
  label?: string;
}

export function Avatar({ descriptor, size = 48, className = '', label = '' }: AvatarProps) {
  const { version, seed, palette } = parseAvatarDescriptor(descriptor);
  const src = useMemo(() => generateAvatarDataUri({ version, seed, palette }), [version, seed, palette]);
  if (!Number.isInteger(size) || size < 1 || size > 4096)
    throw new RangeError('Avatar size must be an integer from 1 to 4096.');
  return <img className={`avatar ${className}`} src={src} width={size} height={size} alt={label} draggable={false} />;
}
