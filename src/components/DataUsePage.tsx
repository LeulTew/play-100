import { useEffect } from 'react';
import { SiteFooter } from './SiteFooter';

export default function DataUsePage() {
  useEffect(() => { document.title = 'Data use | Play 100'; }, []);
  return <>
    <a className="skip-link" href="#data-use">Skip to data use</a>
    <header className="site-header"><a className="wordmark" href="/">PLAY<span>100</span><i aria-hidden="true">.</i></a><a className="text-button" href="/account">Account</a></header>
    <main className="app-page data-use-page" id="data-use">
      <h1>Data use</h1>
      <p>Device storage, account saving and public sharing are separate choices. This page does not open your private library or start online saving.</p>
      <h2>Device-only libraries</h2>
      <p>Your games, ratings, notes, queue and play history can stay in this browser. Browser storage also keeps display settings and a small account-loading preference. Clearing site data can remove these copies. You can download a backup from Account or Settings.</p>
      <h2>Sign-in</h2>
      <p>Firebase manages Google or email/password sign-in. Google requests basic identity, email and profile access, not your contacts or files. Sign-in identifies an account, not a verified person. Play 100 does not implement its own password store.</p>
      <p>Supported browsers retain sign-in until you sign out or the session is revoked. Private browsing, blocked storage, cleared site data or provider restrictions can require another sign-in. A deployment does not intentionally clear your account or library.</p>
      <h2>Online saving</h2>
      <p>When you agree to online saving, the creator can view your chosen account profile and ranking summary. Private library data is stored under your verified account. Notes, queue and play history are excluded from the creator’s ranking view, but the project operator can technically access data in the database.</p>
      <p>Existing active account copies can restore into an empty, unchanged account cache after sign-in. Guest data is not merged or uploaded automatically. Dirty copies, stopped saving, deleted data and conflicts require a safe choice.</p>
      <p>Edits save on the device before uploading. A visible, connected browser retries temporary failures; closed browsers cannot run those updates. Firebase’s free quotas are finite. Quota exhaustion can delay saving without enabling billing.</p>
      <h2>Profiles and icons</h2>
      <p>A saved name and chosen creature are account profile data. Creature images are generated locally. No uploaded image or Google profile photo is used. Saving an icon does not update an existing public snapshot.</p>
      <h2>Friends and comparisons</h2>
      <p>Connecting with someone shares your chosen name and icon, not your private library. Friend requests require acceptance. Invitation links are single-use, expire after seven days and can be revoked; anyone you send the link to can preview your invitation. Keep the link private.</p>
      <p>Friends sharing is off until you preview a selection and agree. Up to 200 selected games, their order and optional scores can update automatically after your saved edits. Newly added games are not selected automatically. Notes, email, queue and play history are excluded.</p>
      <p>Removing a friendship, blocking a person, stopping sharing or deleting the account stops new friends-only reads. Previously copied information cannot be recalled. Stopping private online saving pauses automatic updates but keeps an existing shared ranking visible until friends sharing is also stopped.</p>
      <p>Comparison groups are private saved participant selections, not chat rooms or a permission grant. Unavailable rankings are labelled; groups do not store a copy of another person's private scores. Account exports omit active invitation links and other people's ranking data.</p>
      <h2>Public rankings</h2>
      <p>Publishing requires its own preview and consent. Anyone with a published link can view the selected games, order and scores. A link-only ranking is public, not private. Listing in Community is another optional choice.</p>
      <p>Public snapshots change only when you update them. They exclude email, notes, queue and play history. Unpublishing or moderation stops new server reads; it cannot recall screenshots, downloads or copies others already made.</p>
      <h2>Export, stop and delete</h2>
      <p>Signing out leaves your account’s device cache and guest library separate. Stopping online saving retains saved copies but stops uploads. Deleting an online copy removes its online profile and library, unpublishes its ranking and retains the account’s local recovery copy.</p>
      <p>Account deletion requires recent confirmation and finishes cloud cleanup before removing the sign-in account. Some content-free identity and revocation markers remain to prevent stale sessions recreating deleted content. A device-only guest library is not deleted by these account actions.</p>
      <h2>Services and essential storage</h2>
      <p>Vercel hosts the site; Firebase provides authentication and online data; Google handles Google sign-in. These services may use essential storage or cookies for their operation. Play 100 has no advertising analytics, contact scraping or bulk invitation email service. Catalog searches use the listed data providers; source links stay attached to their records.</p>
      <p>Use Account for exports and deletion, or the creator links below for questions.</p>
    </main>
    <SiteFooter />
  </>;
}
