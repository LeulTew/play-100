export default function DataUseContent() {
  return (
    <>
      <h2>Device-only libraries</h2>
      <p>
        Browser storage keeps games, ratings, notes, Play later, play history, display settings and your account-loading
        preference. Clearing site data can erase them. Backups: Account or Settings.
      </p>
      <p>
        Compare keeps up to six pins per device or account. Pinning never adds, rates or shares games; sign-in never
        copies guest pins. Filters and people selections stay in private tab history, not public links.
      </p>
      <h2>Installation and offline access</h2>
      <p>
        Install through your browser. Offline preparation downloads public app files, collection details and recently
        viewed app artwork within storage limits. It excludes private/account data, online-only pages, sign-in details
        and live catalog results, and never replaces your device library. Films and workbooks are not downloaded
        automatically.
      </p>
      <p>
        Online features need a connection; account and guest libraries stay separate. Updates await your choice and
        saved edits. Other app windows or unfinished forms can block reload. This page never enables offline access.
      </p>
      <h2>Sign-in</h2>
      <p>
        Firebase handles Google or email/password sign-in; Play 100 stores no passwords. Google requests basic identity,
        email and profile access, not contacts or files. Sign-in identifies an account, not a verified person.
      </p>
      <p>
        Browsers keep sign-in until sign-out or revoked access, unless private browsing, blocked/cleared storage or
        provider restrictions require re-entry. App releases never intentionally clear accounts or libraries.
      </p>
      <h2>Online saving</h2>
      <p>
        Online-saving consent lets the creator see your chosen profile and ranking summary, not notes, Play later or
        play history. Private library data is stored under your verified account; database operators can access it.
      </p>
      <p>
        After sign-in, an active online copy can restore to your account's empty, unchanged device copy. Guest data
        never merges or uploads automatically. Pending device edits, stopped saving, deletion or conflicts require your
        choice before replacement.
      </p>
      <p>
        Edits save locally before uploading. Visible, connected browsers retry temporary failures; closed browsers
        cannot. Service limits can pause saving, never enable billing automatically.
      </p>
      <h2>Profiles and icons</h2>
      <p>
        Your profile stores your name and locally generated creature, never uploaded or Google photos. Icon changes
        leave published rankings unchanged.
      </p>
      <h2>Friends and comparisons</h2>
      <p>
        Connections share your name and icon. Accepted, unblocked friends see allowed games and rankings. Requests need
        acceptance. Invitations are revocable, single-use and expire after seven days. Anyone with the link can preview
        it; keep it private.
      </p>
      <p>
        New verified accounts with online saving default to All: saved game details and rankings, including future
        additions, update for accepted friends. Notes, email, Play later and play history stay excluded. Public profiles
        and Community listing need separate consent. Guest data never transfers automatically.
      </p>
      <p>
        Existing Off or selected-only choices never become All automatically. Share all with friends in Friends, My
        games or Account needs no game selection. Stop remains available. Selected-only sharing allows up to 200 games
        and asks you to review removals. All follows library additions, removals and re-additions.
      </p>
      <p>
        All supports the 10,000-game account limit, sharing in small batches that resume after interruptions. Large
        libraries may take over a day. Unloaded pages aren't missing/unrated games; whole-list results stay unknown
        until complete.
      </p>
      <p>
        Unfriending, blocking, stopping sharing or deleting the account ends access, but cannot recall copies. In All,
        stopping online saving also ends sharing; restarting needs Share all. Pausing selected-only saving can retain
        its last shared copy until you stop sharing.
      </p>
      <p>
        Once All sharing is ready for friends, older app versions cannot save online or stop online saving. Refresh, or
        first choose Stop in friend sharing. Accounts without active All sharing are unaffected; pending device edits
        are never discarded.
      </p>
      <p>
        Comparison groups save private people selections, not chats, permissions or others' scores. Unavailable rankings
        are labelled. Account exports exclude active invitation links and others' rankings.
      </p>
      <p>Private counts limit new groups, blocks and reports; account deletion removes these counts.</p>
      <h2>Public rankings</h2>
      <p>
        Publishing needs separate preview and consent. Links publicly show selected games, order and scores. Community
        listing is a separate choice.
      </p>
      <p>
        Only your updates change published copies. Email, notes, Play later and play history stay excluded. Unpublishing
        or moderation stops new access, not existing screenshots, downloads or copies.
      </p>
      <h2>Export, stop and delete</h2>
      <p>
        Sign out keeps the account's separate device copy. Sign out and remove this device's copy also deletes its
        local, recovery and saved sharing data, unless edits await upload or the copy changes. Guest and online copies
        remain. Stopping online saving keeps copies but stops uploads. Deleting an online copy removes its profile and
        library and unpublishes its ranking, keeping device recovery data.
      </p>
      <p>
        Account deletion needs recent sign-in. Your online library, ranking summary and shared/public copies are deleted
        before your sign-in. If interrupted, the account stays. Choose Finish deleting in Account later, even another
        day; sign-in may be required again.
      </p>
      <p>
        Some older shared copies need the site owner's separate review and removal. Content-free records remain to
        prevent old sessions restoring deleted data. Device-only guest libraries are unaffected.
      </p>
      <h2>Services and essential storage</h2>
      <p>
        Vercel hosts; Firebase handles sign-in/online data; Google handles Google sign-in, using essential storage or
        cookies as needed. No advertising analytics, contact scraping or bulk invitation emails. Catalog records retain
        listed providers' source links.
      </p>
      <p>
        Browser security reports count known blocked sites, security rules and page types, never full URLs, queries, IP
        addresses, browser details or account IDs. Scheduled checks record sign-in helper and catalog response status
        without account credentials. Error screens may send batched counts by error type, component, page type and app
        build, never messages or stack traces. Counts use no device storage or visitor ID: at most 20 errors and four
        send attempts per page. These are service checks, not visitor analytics. Hosts process normal requests under
        their own policies.
      </p>
      <p>
        Online lookup requests eligible Discover public ratings/licensed art by exact public game ID. Wikidata scores
        retain credit; Steam recommendations require an unambiguous app ID. Wikimedia Commons art needs license, creator
        and image-size checks, with full credit. The 100 is not enriched again.
      </p>
      <p>
        Requests exclude private titles, ratings, notes, progress and account IDs. Disable online lookup anytime;
        fetched public facts may remain in session memory, labelled with retrieval dates. External scores are neither
        combined nor treated as yours. Missing data is not zero.
      </p>
      <p>Exports/deletion: Account. Questions: creator links below.</p>
    </>
  );
}
