import { useEffect, useRef, useState } from 'react';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { AvatarValue, Member, ProfileReport, PublicControl } from '../lib/community';
import type { CreatorRank } from '../lib/cloud-types';
import { Avatar } from '../components/avatar/Avatar';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { CloudStore } from './cloud-store';
import { cloudDb } from './firebase-client';
import { onlineError } from './errors';
import type { SocialStore } from './social-store';

export function CreatorPage({ social, allowed, verified, onAccount }: { social: SocialStore; allowed: boolean; verified: boolean; onAccount: () => void }) {
  const [tab, setTab] = useState<'members' | 'reports'>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [reports, setReports] = useState<ProfileReport[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<{ uid: string; displayName: string; avatar: AvatarValue | null; publicOnly: boolean } | null>(null);
  const [ranking, setRanking] = useState<CreatorRank[]>([]);
  const [control, setControl] = useState<PublicControl | null>(null);
  const [limit, setLimit] = useState(30);
  const [confirmHide, setConfirmHide] = useState(false);
  const selectedRequest = useRef(0);
  useEffect(() => {
    let canceled = false;
    if (!allowed) return;
    setBusy(true); setError(''); setCursor(undefined);
    void (tab === 'members' ? social.members().then((page) => { if (!canceled) { setMembers(page.members); setCursor(page.cursor); } }) : social.reports().then((page) => { if (!canceled) { setReports(page.reports); setCursor(page.cursor); } }))
      .catch((cause) => { if (!canceled) setError(onlineError(cause)); }).finally(() => { if (!canceled) setBusy(false); });
    return () => { canceled = true; };
  }, [social, allowed, tab]);
  const openTarget = async (uid: string, known?: Member) => {
    const request = ++selectedRequest.current;
    setSelected({ uid, displayName: known?.displayName ?? 'Opening profile...', avatar: known?.avatar ?? null, publicOnly: false });
    setRanking([]); setControl(null); setLimit(30); setBusy(true); setError('');
    try {
      const [member, publication, permissions] = await Promise.all([known ?? social.member(uid), social.ownProfile(uid), social.control(uid)]);
      if (request !== selectedRequest.current) return;
      setSelected({ uid, displayName: member?.displayName ?? publication?.displayName ?? 'Removed profile', avatar: member?.avatar ?? publication?.avatar ?? null, publicOnly: false });
      setControl(permissions);
      const summary = await new CloudStore(cloudDb, uid).ranking();
      const publicOnly = summary.length === 0 && publication !== null;
      const rows = publicOnly && publication ? (await social.entries(publication)).map(({ id, title, position, score }) => ({ id, title, position, score })) : summary;
      if (request === selectedRequest.current) {
        setSelected({ uid, displayName: member?.displayName ?? publication?.displayName ?? 'Removed profile', avatar: member?.avatar ?? publication?.avatar ?? null, publicOnly });
        setRanking(rows); setControl(permissions);
      }
    } catch (cause) { if (request === selectedRequest.current) setError(onlineError(cause)); }
    finally { if (request === selectedRequest.current) setBusy(false); }
  };
  if (!allowed) return <section className="app-page empty-state"><h1 data-page-heading tabIndex={-1}>Creator access only.</h1><p>{verified ? 'This verified account is not authorized for the creator desk. Private member information is protected by server rules.' : 'Sign in and verify the owner account before accessing member information.'}</p><button className="button button-dark" onClick={onAccount}>Open Account</button></section>;
  return (
    <section className="app-page creator-page" aria-labelledby="creator-title">
      <div className="page-heading"><div><h1 id="creator-title" data-page-heading tabIndex={-1}>Creator desk</h1></div></div>
      <div className="personal-tabs"><button aria-pressed={tab === 'members'} onClick={() => setTab('members')}>Members</button><button aria-pressed={tab === 'reports'} onClick={() => setTab('reports')}>Reports</button></div>
      {error && <p className="inline-error" role="alert">{error}</p>}{busy && <p role="status" className="catalog-loading">Loading protected records...</p>}
      {tab === 'members' ? members.length ? <ul className="creator-members">{members.map((member) => <li key={member.uid}><Avatar descriptor={member.avatar} size={48} /><div><h2>{member.displayName}</h2><p>{member.rankCount} synced ranks · Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(member.updatedAt)}</p></div><button className="text-button" onClick={() => { void openTarget(member.uid, member); }}>View ranking<Icon name="arrow" width="17" height="17" /><span className="sr-only">for {member.displayName}</span></button></li>)}</ul> : !busy && !error && <div className="empty-state"><h2>No members</h2></div> :
        reports.length ? <ul className="creator-reports">{reports.map((report) => <li key={report.id}><div><strong>{report.status === 'open' ? 'Needs review' : 'Resolved'}</strong><p>{report.reason}</p><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(report.createdAt)}</small></div><div className="button-row"><button className="text-button" onClick={() => { void openTarget(report.targetUid); }}>Inspect profile</button><button className="text-button" disabled={report.status === 'resolved' || busy} onClick={() => { setBusy(true); void social.resolveReport(report.id).then(() => setReports((previous) => previous.map((item) => item.id === report.id ? { ...item, status: 'resolved' } : item))).catch((cause) => setError(onlineError(cause))).finally(() => setBusy(false)); }}>Mark resolved</button></div></li>)}</ul> : !busy && !error && <div className="empty-state"><h2>No reports to review.</h2><p>Verified members can report a public profile once. Reporting alone never hides it.</p></div>}
      {cursor && <button className="button button-outline public-more" disabled={busy} onClick={() => {
        setBusy(true);
        void (tab === 'members' ? social.members(cursor).then((page) => { setMembers((previous) => [...previous, ...page.members]); setCursor(page.cursor); }) : social.reports(cursor).then((page) => { setReports((previous) => [...previous, ...page.reports]); setCursor(page.cursor); })).catch((cause) => setError(onlineError(cause))).finally(() => setBusy(false));
      }}>Load next 20<Icon name="down" width="17" height="17" /></button>}
      {selected && <Dialog open titleId="member-ranking-title" className="info-dialog creator-ranking-dialog" onClose={() => { selectedRequest.current += 1; setSelected(null); setConfirmHide(false); setBusy(false); }}><div className="publication-identity">{selected.avatar && <Avatar descriptor={selected.avatar} size={64} />}<div><h2 id="member-ranking-title" data-autofocus tabIndex={-1}>{selected.displayName}</h2><p>{selected.publicOnly ? 'Published ranking snapshot.' : 'Private ranking summary.'} No notes or play history.</p></div></div>{busy && <p role="status">Loading...</p>}{error && <p className="inline-error" role="alert">{error}</p>}<ol className="publication-preview-list">{ranking.slice(0, limit).map((entry) => <li key={entry.id}><span>{entry.position}. {entry.title}</span><strong>{entry.score ?? '—'}</strong></li>)}</ol>{!busy && !ranking.length && <p>No current ranking snapshot is available. Moderation still applies to this account's UID.</p>}{limit < ranking.length && <button className="text-button" onClick={() => setLimit((value) => value + 30)}>Show more ranked games</button>}
        {control && <div className="moderation-panel"><h3>Public-content moderation</h3><p>{control.hidden ? 'Publishing is paused for this account. Restoring permission does not republish a list automatically.' : 'Hiding removes the public list from new reads and prevents this account from republishing until you restore permission.'}</p>{confirmHide ? <div className="button-row"><button className="button button-outline" disabled={busy} onClick={() => setConfirmHide(false)}>Cancel moderation</button><button className="button button-danger" disabled={busy} onClick={() => {
          setBusy(true);
          void social.moderate(selected.uid, !control.hidden).then(() => { setControl({ ...control, hidden: !control.hidden, epoch: control.epoch + 1 }); setConfirmHide(false); }).catch((cause) => setError(onlineError(cause))).finally(() => setBusy(false));
        }}>{control.hidden ? 'Restore publishing permission' : 'Hide and pause publishing'}</button></div> : <button className="text-button danger-text" disabled={busy} onClick={() => setConfirmHide(true)}>{control.hidden ? 'Restore publishing permission' : 'Hide public profile'}</button>}</div>}
      </Dialog>}
    </section>
  );
}
