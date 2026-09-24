import type { AccountIdentity } from './ui-types';

export function hasProvider(identity: Pick<AccountIdentity, 'providers'> | null | undefined, providerId: string): boolean {
  return identity?.providers.some(id => id === providerId) ?? false;
}
