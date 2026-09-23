import { createPwaController as createClient } from './client';

// Own the dynamic entry export even when the client is shared with other chunks.
export function createPwaController() {
  return createClient();
}
