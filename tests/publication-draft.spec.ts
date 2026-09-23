import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ComponentType } from 'react';
import type { AccountIdentity } from '../src/cloud/ui-types';
import type { SocialStore } from '../src/cloud/social-store';
import type { Member, PublicControl, PublicProfile } from '../src/lib/community';
import { projectPublicRanking } from '../src/lib/community';
import type { AvatarDescriptor } from '../src/lib/avatar';
import type { Game } from '../src/lib/types';
import type { PersonalLibraryState } from '../src/lib/personal-types';
import { recordFromGame } from '../src/lib/personal-types';
import { parseCollection } from '../src/lib/collection';
import { applyPersonalAction, emptyPersonalLibrary } from '../src/lib/personal-library';

const games = parseCollection(JSON.parse(readFileSync(new URL('../public/data/collection.json', import.meta.url), 'utf8'))).games.slice(0, 2);
const avatar: AvatarDescriptor = { version: 1, seed: '0123456789abcdef0123456789abcdef', palette: 'lime' };
const identity: AccountIdentity = { uid: 'publication-alpha', email: 'alpha@example.test', displayName: 'Auth fallback', verified: true, providers: ['password'] };
const member: Member = { uid: identity.uid, displayName: 'Different private member', avatar, createdAt: 1, updatedAt: 1, consentVersion: 1, rankCount: 2, gameCount: 2 };
const profile: PublicProfile = { uid: identity.uid, displayName: 'Published persona', handle: 'published_persona', title: 'Stored public title', avatar, count: 2, preview: games.map(game => game.title), generation: 'original', epoch: 3, published: true, listed: true, hidden: false, creator: false, updatedAt: 1 };
const records = games.map(recordFromGame);
const initial = applyPersonalAction(applyPersonalAction(emptyPersonalLibrary(), { type: 'rate-game', record: records[0]!, score: 8.5 }), { type: 'rate-game', record: records[1]!, score: 7 });
type PublishInput = Parameters<SocialStore['publish']>[1];
interface PanelProps {
  social: Pick<SocialStore, 'control' | 'saveMember' | 'publish' | 'unpublish'>;
  identity: AccountIdentity; member: Member | null; avatar: AvatarDescriptor; state: PersonalLibraryState; games: Game[];
  existing: PublicProfile | null; isCreator: boolean; onAccount: () => void; onPublished: (profile: PublicProfile) => void;
}
type Patch = Partial<Pick<PanelProps, 'identity' | 'member' | 'existing' | 'state'>>;
interface Probe {
  patch: (patch: Patch) => void;
  releaseControl: () => Promise<void>;
  calls: { controls: string[]; saves: number; publications: { uid: string; input: PublishInput; control: PublicControl }[] };
}
declare global { interface Window { publicationDraftProbe: Probe } }

async function mount(page: Page, options: { existing?: boolean; holdControl?: boolean } = {}) {
  await page.goto('/data-use');
  await expect(page.getByRole('heading', { name: 'Data use', exact: true })).toBeVisible();
  await page.evaluate(async ({ identity, member, profile, avatar, state, games, options }) => {
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const reactUrl = resources.findLast(url => new URL(url).pathname === '/node_modules/.vite/deps/react.js');
    const domUrl = resources.findLast(url => new URL(url).pathname === '/node_modules/.vite/deps/react-dom_client.js');
    if (!reactUrl || !domUrl) throw new Error('The current app React runtime is required for this controlled component fixture.');
    const { default: React }: { default: typeof import('react') } = await import(reactUrl);
    const { default: ReactDom }: { default: typeof import('react-dom/client') } = await import(domUrl);
    const componentPath = '/src/cloud/PublishPage.tsx';
    const { PublishPage }: { PublishPage: ComponentType<PanelProps> } = await import(componentPath);
    const container = document.createElement('div'); container.id = 'publication-draft-fixture'; document.body.append(container);
    const root = ReactDom.createRoot(container);
    const calls: Probe['calls'] = { controls: [], saves: 0, publications: [] };
    let release: (control: PublicControl) => void = () => { throw new Error('The held control was not initialized.'); };
    const pending = new Promise<PublicControl>(resolve => { release = resolve; });
    const social: PanelProps['social'] = {
      control: async uid => { calls.controls.push(uid); return options.holdControl && uid === identity.uid ? pending : { epoch: 3, hidden: false, deleted: false }; },
      saveMember: async () => { calls.saves += 1; },
      publish: async (uid, input, control) => { calls.publications.push({ uid, input, control }); return { ...profile, uid, ...input, generation: 'mock-confirmed', updatedAt: 2 }; },
      unpublish: async () => { throw new Error('This controlled fixture must not unpublish.'); },
    };
    let props: PanelProps = { social, identity, member: options.existing ? member : null, existing: options.existing ? profile : null, avatar, state, games, isCreator: false, onAccount: () => {}, onPublished: () => {} };
    const render = () => root.render(React.createElement(PublishPage, props));
    window.publicationDraftProbe = {
      calls,
      patch: patch => { props = { ...props, ...patch }; render(); },
      releaseControl: async () => { release({ epoch: 99, hidden: true, deleted: false }); await pending; await Promise.resolve(); },
    };
    render();
  }, { identity, member, profile, avatar, state: initial, games, options });
  await expect(page.locator('#publication-draft-fixture input[name="public-name"]')).toBeVisible();
}
const panel = (page: Page) => page.locator('#publication-draft-fixture');
const field = (page: Page, name: string) => panel(page).locator(`input[name="${name}"]`);
const patch = (page: Page, value: Patch) => page.evaluate(value => window.publicationDraftProbe.patch(value), value);

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('a legacy reserved handle explains its rejection before preview and permits a compliant rename', async ({ page }) => {
  await mount(page, { existing: true });
  await patch(page, { existing: { ...profile, handle: 'support_team' } });
  await expect(field(page, 'public-handle')).toHaveValue('support_team');
  await expect(field(page, 'public-handle')).toHaveAttribute('aria-invalid', 'true');
  await expect(panel(page).getByRole('alert')).toContainText('reserved');
  await expect(panel(page).getByRole('button', { name: 'Preview public snapshot', exact: true })).toBeDisabled();
  await field(page, 'public-handle').fill('my_new_games');
  await expect(field(page, 'public-handle')).toHaveAttribute('aria-invalid', 'false');
  await expect(panel(page).getByRole('button', { name: 'Preview public snapshot', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.publicationDraftProbe.calls.publications)).toEqual([]);
});

test('late owned publication hydrates untouched public fields and listing, not the private member identity', async ({ page }) => {
  await mount(page);
  await expect(field(page, 'public-name')).toHaveValue('Auth fallback');
  await patch(page, { member });
  await expect(field(page, 'public-name')).toHaveValue(member.displayName);
  await patch(page, { existing: profile });
  await expect(field(page, 'public-name')).toHaveValue(profile.displayName);
  await expect(field(page, 'public-handle')).toHaveValue(profile.handle);
  await expect(field(page, 'ranking-title')).toHaveValue(profile.title);
  await expect(panel(page).getByRole('checkbox', { name: 'Show in Community', exact: true })).toBeChecked();
  await patch(page, { member: { ...member, displayName: 'Later private rename' }, existing: null });
  await expect(field(page, 'public-name')).toHaveValue(profile.displayName);
  await panel(page).getByRole('button', { name: 'Preview public snapshot', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Public preview', exact: true })).toContainText(profile.title);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  expect(await page.evaluate(() => window.publicationDraftProbe.calls.publications)).toEqual([]);
});

test('early edits and deliberate clears are not overwritten by late profile or member data', async ({ page }) => {
  await mount(page);
  await field(page, 'public-name').fill('My explicit public name');
  await field(page, 'public-handle').fill('typed_handle');
  await field(page, 'public-handle').fill('');
  await field(page, 'ranking-title').fill('');
  await patch(page, { member, existing: profile });
  await expect(field(page, 'public-name')).toHaveValue('My explicit public name');
  await expect(field(page, 'public-handle')).toHaveValue('');
  await expect(field(page, 'ranking-title')).toHaveValue('');
  await field(page, 'public-name').fill('');
  await patch(page, { existing: { ...profile, displayName: 'New server name', updatedAt: 2 } });
  await expect(field(page, 'public-name')).toHaveValue('');
});

test('early listing and game-selection intent survive late publication initialization', async ({ page }) => {
  await mount(page);
  const listing = panel(page).getByRole('checkbox', { name: 'Show in Community', exact: true });
  await listing.check(); await listing.uncheck();
  await panel(page).locator('.publish-selection-list input').first().uncheck();
  await patch(page, { existing: profile });
  await expect(listing).not.toBeChecked();
  await expect(panel(page).locator('.publish-selection-list input:checked')).toHaveCount(1);
  await expect(panel(page).locator('.publication-selection')).toContainText('1 of 200 selected');
});

test('late props update untouched inputs but never alter the frozen preview or its explicitly submitted mock payload', async ({ page }) => {
  await mount(page, { existing: true });
  await panel(page).getByRole('button', { name: 'Preview public snapshot', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Public preview', exact: true });
  const before = await preview.locator('.publication-preview-list').textContent();
  const changed = applyPersonalAction(initial, { type: 'edit-ranking', id: records[0]!.id, score: 9.25, note: 'Still private' });
  await patch(page, { existing: { ...profile, displayName: 'Later public identity', title: 'Later title', listed: false, updatedAt: 2 }, state: changed });
  await expect(field(page, 'public-name')).toHaveValue('Later public identity');
  await expect(preview).toContainText(profile.displayName);
  await expect(preview).toContainText(profile.title);
  expect(await preview.locator('.publication-preview-list').textContent()).toBe(before);
  await expect(preview.getByRole('button', { name: 'Update published ranking', exact: true })).toBeDisabled();
  await preview.getByRole('checkbox', { name: 'I want this selected snapshot to be public.', exact: true }).check();
  await preview.getByRole('button', { name: 'Update published ranking', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.publicationDraftProbe.calls.publications.length)).toBe(1);
  const published = (await page.evaluate(() => window.publicationDraftProbe.calls.publications))[0]!;
  expect(published.uid).toBe(identity.uid);
  expect(published.input).toEqual({ displayName: profile.displayName, handle: profile.handle, title: profile.title, listed: true, avatar, entries: projectPublicRanking(initial, new Set(initial.ranking.map(entry => entry.id)), games), control: { epoch: 3, hidden: false, deleted: false }, creator: false });
  expect(published.control).toEqual({ epoch: 3, hidden: false, deleted: false });
});

test('an identity boundary drops prior edits and rejects foreign props and the previous pending control read', async ({ page }) => {
  await mount(page, { existing: true, holdControl: true });
  await field(page, 'public-name').fill('Unsaved Alpha name');
  await field(page, 'public-handle').fill('alpha_draft');
  const beta = { ...identity, uid: 'publication-beta', email: 'beta@example.test', displayName: 'Beta auth' };
  await patch(page, { identity: beta, member, existing: profile });
  await expect(field(page, 'public-name')).toHaveValue('Beta auth');
  await expect(field(page, 'public-handle')).toHaveValue('');
  await expect(field(page, 'ranking-title')).toHaveValue('My games, my order');
  await expect(panel(page).getByRole('checkbox', { name: 'Show in Community', exact: true })).not.toBeChecked();
  await field(page, 'public-handle').fill('beta_draft');
  await page.evaluate(() => window.publicationDraftProbe.releaseControl());
  await expect(panel(page).getByRole('button', { name: 'Preview public snapshot', exact: true })).toBeEnabled();
  await expect(panel(page)).not.toContainText('The creator has paused publishing');
  await patch(page, { existing: { ...profile, uid: beta.uid, displayName: 'Beta published', handle: 'beta_saved' } });
  await expect(field(page, 'public-name')).toHaveValue('Beta published');
  await expect(field(page, 'public-handle')).toHaveValue('beta_draft');
  expect(await page.evaluate(() => window.publicationDraftProbe.calls.publications)).toEqual([]);
});
