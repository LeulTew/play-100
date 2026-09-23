import { useState } from 'react';
import type { ReactNode } from 'react';

export interface FriendSharingSummaryProps {
  mode: string;
  status: string;
  canEnable: boolean;
  enabled: boolean;
  error: string;
  progress?: ReactNode;
  onEnable: () => Promise<void>;
  onStop: () => Promise<void>;
  onRefresh: () => Promise<void>;
}
export function FriendSharingSummary({ mode, status, canEnable, enabled, error, progress, onEnable, onStop, onRefresh }: FriendSharingSummaryProps) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const labels: Record<string, string> = { saved: 'Up to date', pending: 'Waiting for saved edits', saving: 'Updating', checking: 'Checking', paused: 'Paused', retrying: 'Retrying', quota: 'Continuing later', error: 'Needs attention' };
  const change = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setProblem('');
    try { await operation(); }
    catch (cause) { setProblem(cause instanceof Error ? cause.message : 'Sharing could not be confirmed. Refresh its status.'); }
    finally { setBusy(false); }
  };
  return <section className="friend-sharing-summary" aria-label="Friend sharing">
    <div className="button-row">
      <p role="status">{mode === 'checking' ? 'Checking friend sharing...' : mode === 'all' ? <>Sharing all saved games and rankings with friends. <strong>{labels[status] ?? status}</strong></> :
        mode === 'legacy' ? 'Your previous sharing choice is unchanged.' : mode === 'paused' ? 'Automatic friend sharing is paused.' : mode === 'revoked' ? 'Friend sharing is revoked.' : 'Automatic friend sharing is off.'}</p>
      {canEnable && <button className="button button-outline" disabled={busy || Boolean(problem)} onClick={() => { void change(onEnable); }}>Share all with friends</button>}
      {enabled && <button className="text-button" disabled={busy} onClick={() => { void change(onStop); }}>Stop friend sharing</button>}
    </div>
    <p className="section-help">Accepted friends only. Notes, email, queue and play history stay private. Public sharing is separate.</p>
    {progress}
    {(problem || error) && <p className="inline-error" role="alert">{problem || error}</p>}
    {(problem || error || status === 'error' || status === 'quota' || status === 'retrying') && <button className="text-button" disabled={busy} onClick={() => { void change(onRefresh); }}>Refresh sharing status</button>}
    {status === 'quota' && <p className="section-help">The online service has reached a limit. Sharing can continue later without starting over.</p>}
  </section>;
}
