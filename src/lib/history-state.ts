import { isRecord, type JsonObject } from './guards';

// history.state is typed any; entries the app did not write read as absent.
export function historyState(): JsonObject {
  const state: unknown = history.state;
  return isRecord(state) ? state : {};
}
