import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { author } from '../lib/author';

export function AboutDialog({
  onClose,
  getReturnFocus,
}: {
  onClose: () => void;
  getReturnFocus?: () => HTMLElement | null;
}) {
  return (
    <Dialog
      open
      titleId="about-title"
      onClose={onClose}
      getReturnFocus={getReturnFocus}
      className="info-dialog"
      motion={{ preset: 'dialog', enterMs: 160 }}
    >
      <h2 id="about-title" data-autofocus tabIndex={-1}>
        About &amp; credits
      </h2>
      <p className="dialog-lead">A personal 100-game collection, not an official ranking.</p>
      <section>
        <h3>Original order</h3>
        <p>
          <strong>Core 50</strong>: ranks 1–50. <strong>Essential 50</strong>: ranks 51–100. Sorting preserves the
          workbook's main-sheet order and manual changes.
        </p>
      </section>
      <section>
        <h3>Author ratings</h3>
        <p>
          {author.fullName}'s rank-based scores come from the workbook column "my rating(based on rank)". Cards, tables
          and details preserve its saved numbers, rounding and text, without recalculation.
        </p>
        <p>
          The Witcher 3: 9.9; Grand Theft Auto IV: 9.8. Source notes stay attached; your editable ratings are separate,
          never prefilled.
        </p>
      </section>
      <section>
        <h3>Critic scores</h3>
        <p>
          Workbook critic scores are not live, newly researched or independently verified. Scales: Metacritic/PC Gamer
          100; IGN/GameSpot 10.
        </p>
        <p>
          Critic averages use entered scores converted to 100. Both Metacritic columns count; missing scores don't. This
          isn't an official aggregate or count of independent publications.
        </p>
      </section>
      <section>
        <h3>Source notes &amp; artwork</h3>
        <p>
          Details preserve AI / not-played source notes. A missing note doesn't mean the game was played. Your personal
          list starts empty.
        </p>
        <p>
          The source excludes Nintendo but keeps premium non-AAA exceptions. No invented platforms, playtimes or scores.
        </p>
        <p>
          Supplied cover thumbnails stay at native size in collection frames. Rank 73 keeps "Hitman: World of
          Assassination", 2016 and its HITMAN III-branded cover; packaging proves no exact edition or platform.
        </p>
      </section>
      <section>
        <h3>Data &amp; privacy</h3>
        <p>
          Guest games, progress, ratings and notes stay in browser storage. Optional Google or verified email accounts
          use Firebase Authentication and Firestore at no cost. Each account has a separate device copy. Sign-in never
          uploads guest data automatically; online saving needs separate consent.
        </p>
        <p>
          Online-saving consent lets the creator view your profile and ranking summary, not notes or Play later.
          Database operators can access stored data. No Supabase, analytics scripts, ad trackers, anonymous accounts or
          remote avatar services are used.
        </p>
        <p>
          Rankings can include unplayed games; ranking never marks them played or completed. Publishing shares only the
          previewed profile and selected ratings, not email, notes or play history. Community listing needs separate
          consent. Link-only rankings are public to anyone with the link.
        </p>
        <p>
          Settings offers backup export/import and protection from automatic storage cleanup. Clearing site data can
          erase edits not yet uploaded. Service limits can pause online saving; errors and conflicts never silently
          replace device copies. Account offers sign-out, stopping online saving, export and deletion. Content-free
          records remain to stop old sessions restoring deleted data.
        </p>
      </section>
      <section>
        <h3>Public catalogs</h3>
        <p>
          Discover includes a built-in catalog and optional online facts from Wikidata (CC0) and the documented
          FreeToGame API. FreeToGame data retains credit and source links.
        </p>
        <div className="button-row" role="group" aria-label="Public catalog sources">
          <a
            className="text-button"
            href="https://www.wikidata.org/wiki/Wikidata:Data_access"
            target="_blank"
            rel="noreferrer"
          >
            Wikidata (CC0)
            <Icon name="up-right" width="17" height="17" />
          </a>
          <a className="text-button" href="https://www.freetogame.com/api-doc" target="_blank" rel="noreferrer">
            FreeToGame API
            <Icon name="up-right" width="17" height="17" />
          </a>
          <a className="text-button" href="https://www.freetogame.com/" target="_blank" rel="noreferrer">
            FreeToGame
            <Icon name="up-right" width="17" height="17" />
          </a>
        </div>
        <p>
          Online search sends your query through a read-only relay to your chosen provider, never your private library,
          notes or rankings. Pages load on request. Wikidata: classified video games only. FreeToGame: its free-to-play
          catalog. Neither covers every game.
        </p>
        <p>
          Searches import facts, not descriptions, prices or reviews. With online lookup on, eligible Discover details
          can also load labelled public ratings and licensed, credited artwork. The 100 keeps its original artwork and
          scores.
        </p>
        <p>
          Dates may identify editions, not first worldwide releases. No account/API key required. Failed sources show
          errors, not empty results. Manual titles are supported.
        </p>
      </section>
      <section className="credits">
        <h3>Sources &amp; credits</h3>
        <p>
          Source: <span className="source-filename">AAA_games_u_have_to_play_list_top_100.xlsx</span>, "AAA Top 50" tab
          (100 entries). Enhanced download: other sheets aligned. Untouched original: also available; older derived tabs
          don't define order.
        </p>
        <p>
          All 100 covers came with the workbook; owners retain rights. Fallback jackets and the folding 3D collection
          are original supporting art, not official covers.
        </p>
        <p>
          Built with React, Three.js, dnd kit, IndexedDB and customized React Bits CountUp, Magnet and AnimatedContent.
          React Bits: copyright 2026 David Haz, MIT + Commons Clause. Barlow Condensed and Hanken Grotesk: SIL Open Font
          License. Local creature avatars: DiceBear Critters (CC0 1.0), DiceBear core (MIT); no Google photo is fetched.
        </p>
        <div className="button-row" role="group" aria-label="Project sources and notices">
          <a className="text-button" href="https://reactbits.dev" target="_blank" rel="noreferrer">
            React Bits
            <Icon name="up-right" width="17" height="17" />
          </a>
          <a className="text-button" href="/licenses/dicebear.txt" target="_blank" rel="noreferrer">
            Creature avatar notices
            <Icon name="up-right" width="17" height="17" />
          </a>
          <a className="text-button" href="/credits.txt" target="_blank" rel="noreferrer">
            Read third-party notices
            <Icon name="up-right" width="17" height="17" />
          </a>
        </div>
      </section>
    </Dialog>
  );
}
