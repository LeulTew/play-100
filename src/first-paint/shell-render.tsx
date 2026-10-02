import { renderToStaticMarkup } from 'react-dom/server';
import type { ShellVariant } from '../../scripts/first-paint/shell-html';
import { FirstPaintGate } from '../components/AfterFirstPaint';
import { AppHeader } from '../components/app/AppHeader';
import { MobileNav } from '../components/app/MobileNav';
import CollectionPage from '../components/CollectionPage';
import { pageDestination } from '../lib/page-navigation';
import { emptyPersonalLibrary } from '../lib/personal-library';
import type { AppPage } from '../lib/types';
import { defaultFilters } from '../lib/url';
import { StaticShellContext } from './static-shell';

const pageHref = (page: AppPage) => {
  const destination = pageDestination(page, defaultFilters);
  return `${destination.path}${destination.search}`;
};

const ignore = () => undefined;

/**
 * The static first-paint shell for index.html (docs/first-paint-shell.md): App's first commit at "/" for a guest,
 * rendered by the build from the components that commit renders, with the props it gives them. StaticShellContext
 * applies the shell's own differences: its controls wait, disabled, for the app, and its artifact caption carries
 * every state the boot script can pick. The wrapper stays hidden unless the boot script finds that first commit.
 */
export function renderShell(variant: ShellVariant): string {
  const online = variant === 'online';
  return renderToStaticMarkup(
    <StaticShellContext value={true}>
      <FirstPaintGate>
        <div className="first-paint-shell" hidden>
          <a className="skip-link" href="#collection">
            Skip to the collection
          </a>
          <AppHeader
            page="collection"
            onlineAvailable={online}
            libraryScope="guest"
            // Online, the first commit is still checking for an account (useOnlineState), so it names none yet.
            libraryLabel={online ? '' : 'Device only'}
            syncStatus="device"
            headerIdentity={null}
            savedCount={0}
            animate={false}
            menuOpen={false}
            pageHref={pageHref}
            onNavigateLink={ignore}
            onQueue={ignore}
            onMenu={ignore}
            onAccount={ignore}
          />
          <main id="page-main">
            <div>
              <CollectionPage
                collection={{ status: 'loading', data: null, error: null, retry: ignore }}
                state={emptyPersonalLibrary()}
                filters={defaultFilters}
                busy={true}
                motion="lite"
                motionPending={true}
                animate={false}
                reducedMotion={false}
                coarsePointer={false}
                constrained={false}
                onFilters={ignore}
                onAction={() => Promise.resolve(true)}
                onOpen={ignore}
                onPreview={ignore}
                onShare={ignore}
                onFullLibrary={ignore}
                notify={ignore}
              />
            </div>
          </main>
          <MobileNav
            page="collection"
            personalPage="collection"
            gamesView="library"
            onlineAvailable={online}
            menuOpen={false}
            pageHref={pageHref}
            onNavigateLink={ignore}
            onBrowseLink={ignore}
            onMenu={ignore}
          />
        </div>
      </FirstPaintGate>
    </StaticShellContext>,
  );
}
