import { createMemoizedModule } from './memoized-module';

export const loadStorageRecovery = createMemoizedModule(() => import('./storage-recovery')).load;
