export default function DataUseContent() {
  return (
    <>
      <h2>Device-only libraries</h2>
      <p>
        Browser storage keeps games, ratings, notes, Play later, play history, display settings and your account-loading
        preference. Clearing site data can erase them. Download a backup from Settings or Account.
      </p>
      <p>
        Compare keeps up to six pins per device or account. Pinning never adds, rates or shares games; sign-in never
        copies guest pins. Your comparison filters and chosen people stay in this tab's private history. Public links do
        not include those choices.
      </p>
      <h2>Installation and offline access</h2>
      <p>
        Install through your browser. Offline preparation downloads public app files, collection details and recently
        viewed app artwork within storage limits. It excludes private data, account data, online-only pages, sign-in
        details and live catalog results, and never replaces your device library. Films and workbooks are not downloaded
        automatically.
      </p>
      <p>
        Online features need a connection; account and guest libraries stay separate. Updates wait until you choose to
        apply them and your edits have saved. Other app windows or unfinished forms can block reload. This page never
        enables offline access.
      </p>
      <h2>Sign-in</h2>
      <p>
        Firebase handles sign-in with Google or an email address and password; Play 100 stores no passwords. Google
        requests basic identity, email and profile access, not contacts or files. Sign-in identifies an account, not a
        verified person.
      </p>
      <p>
        Browsers keep you signed in until you sign out or access is revoked, unless private browsing, blocked or cleared
        storage, or provider restrictions require re-entry. App releases never intentionally clear accounts or
        libraries.
      </p>
      <h2>Online saving</h2>
      <p>
        Online-saving consent lets the creator see your chosen profile and ranking summary, not notes, Play later or
        play history. Private library data is stored under your verified account; database operators can access it.
      </p>
      <p>
        After sign-in, the app can restore your account's online library if online saving is active. Its copy on this
        device must still be empty and unchanged. Guest data never merges or uploads automatically. Pending device
        edits, stopped saving, deletion or conflicts require your choice before replacement.
      </p>
      <p>
        Edits save locally before uploading. Visible, connected browsers retry temporary failures; closed browsers
        cannot. If the service reaches its free limit, online saving pauses; billing is never turned on.
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
        New verified accounts with online saving share all saved game details and rankings with accepted friends by
        default, including future additions. Notes, email, Play later and play history stay excluded. Public profiles
        and Community listing need separate consent. Guest data never transfers automatically.
      </p>
      <p>
        If you previously turned sharing off or chose specific games, that choice stays in place. You can choose Share
        all with friends in Friends, My games or Account without selecting games individually, and stop at any time.
        Selected-only sharing allows up to 200 games and asks you to review removals. Sharing everything follows library
        additions, removals and re-additions.
      </p>
      <p>
        Sharing everything supports the 10,000-game account limit. Games are shared in small batches that resume after
        interruptions. Large libraries may take over a day. Games on pages not yet loaded aren't treated as missing or
        unrated; whole-list results stay unknown until every page is loaded.
      </p>
      <p>
        Unfriending, blocking, stopping sharing or deleting the account ends access, but cannot recall copies. When you
        share everything with friends, stopping online saving also ends sharing. Choose Share all with friends to
        restart it. If you share selected games, pausing online saving can retain the last shared copy until you stop
        sharing.
      </p>
      <p>
        When sharing everything with friends is active, older app versions cannot save online or stop online saving.
        Refresh the app, or first choose Stop in Friend sharing. Accounts that aren't sharing everything are unaffected;
        pending device edits are never discarded.
      </p>
      <p>
        Comparison groups save private people selections, not chats, permissions or others' scores. Unavailable rankings
        are labelled. Account exports exclude active invitation links and others' rankings.
      </p>
      <p>
        The app privately counts your groups, blocks and reports to enforce account limits. Deleting your account
        removes those counts.
      </p>
      <h2>Public rankings</h2>
      <p>
        Publishing requires a separate preview and your consent. Links publicly show selected games, order and scores.
        Community listing is a separate choice.
      </p>
      <p>
        Only your updates change published copies. Email, notes, Play later and play history stay excluded. Unpublishing
        or moderation stops new access, not existing screenshots, downloads or copies.
      </p>
      <h2>Export, stop and delete</h2>
      <p>
        Sign out keeps the account's separate device copy. Sign out and remove this device's copy also deletes its
        local, recovery and saved sharing data, unless edits are waiting to upload or the copy changes. Guest and online
        copies remain. Stopping online saving keeps copies but stops uploads. Deleting an online copy removes its
        profile and library and unpublishes its ranking, keeping device recovery data.
      </p>
      <p>
        Account deletion needs recent sign-in. Your online library, ranking summary and shared and public copies are
        deleted before your sign-in account. If deletion is interrupted, the account stays. Choose Finish deleting in
        Account later, even another day; sign-in may be required again.
      </p>
      <p>
        Some older shared copies need the site owner's separate review and removal. Small records with no library
        content remain so that old sessions can't bring deleted data back. Device-only guest libraries are unaffected.
      </p>
      <h2>Services and essential storage</h2>
      <p>
        Vercel hosts the site. Firebase provides sign-in and online storage. Google handles Google sign-in. These
        services use essential storage or cookies as needed. The app uses no advertising analytics, contact scraping or
        bulk invitation emails. Catalog records retain listed providers' source links.
      </p>
      <p>
        Browser security reports count known blocked sites, security rules and page types, never full URLs, queries, IP
        addresses, browser details or account IDs. Scheduled checks record whether the sign-in service and public
        catalogs respond. They do not use account credentials. Error screens may send batched counts by error type,
        component, page type and app build, never messages or stack traces. Counts use no device storage or visitor ID.
        Reporting is limited to 20 errors and four send attempts per page. These are service checks, not visitor
        analytics. Hosts process normal requests under their own policies.
      </p>
      <p>
        For eligible Discover games, online lookup uses the exact public game ID to request public ratings and licensed
        artwork. Wikidata scores retain credit; Steam recommendations require an unambiguous app ID. Wikimedia Commons
        art needs license, creator and image-size checks, with full credit. These lookups never change The 100.
      </p>
      <p>
        Requests exclude private titles, ratings, notes, progress and account IDs. Disable online lookup anytime;
        fetched public facts may remain in session memory, labelled with retrieval dates. External scores are neither
        combined nor treated as yours. Missing data is not zero.
      </p>
      <p>Use Account to export or delete your data. For questions, use the creator links below.</p>
    </>
  );
}
