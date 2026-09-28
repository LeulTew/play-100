import { beforeEach, expect, it, vi } from 'vitest';
import type { PublicProfile } from '../lib/community';
import { usePublishFields } from './publish-fields';

const harness = vi.hoisted(() => ({
  cursor: 0,
  rendering: false,
  rerender: false,
  effects: 0,
  slots: [] as unknown[],
}));
// Run the real hook without React: a render runs again while it updates its own state, as React does before it
// commits. Any effect is counted, and none is run, so each render's values are what that frame would show.
vi.mock('react', () => {
  const same = (a: readonly unknown[], b: readonly unknown[]) =>
    a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  return {
    useCallback: <T>(callback: T, dependencies: readonly unknown[]) => {
      const index = harness.cursor++;
      const previous = harness.slots[index] as { value: T; dependencies: readonly unknown[] } | undefined;
      if (previous && same(previous.dependencies, dependencies)) return previous.value;
      harness.slots[index] = { value: callback, dependencies };
      return callback;
    },
    useState: <T>(initial: T | (() => T)) => {
      const index = harness.cursor++;
      if (!(index in harness.slots))
        harness.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [
        harness.slots[index] as T,
        (next: T | ((previous: T) => T)) => {
          const value = typeof next === 'function' ? (next as (previous: T) => T)(harness.slots[index] as T) : next;
          if (Object.is(value, harness.slots[index])) return;
          harness.slots[index] = value;
          if (harness.rendering) harness.rerender = true;
        },
      ];
    },
    useEffect: () => {
      harness.effects += 1;
    },
    useLayoutEffect: () => {
      harness.effects += 1;
    },
  };
});

function profile(patch: Partial<PublicProfile> = {}): PublicProfile {
  return {
    uid: 'owner',
    handle: 'published_handle',
    displayName: 'Published name',
    avatar: null as unknown as PublicProfile['avatar'],
    title: 'Published title',
    count: 1,
    preview: [],
    generation: 'g1',
    epoch: 1,
    published: true,
    listed: true,
    hidden: false,
    creator: false,
    updatedAt: 1,
    ...patch,
  };
}
function FieldsProbe(props: { existing: PublicProfile | null; memberName?: string; identityName?: string }) {
  return usePublishFields(props.existing, props.memberName, props.identityName ?? 'Auth name');
}
/** Renders until the hook stops updating its own state, as React does before it commits the frame. */
function render(props: Parameters<typeof FieldsProbe>[0]) {
  for (let pass = 0; pass < 5; pass += 1) {
    harness.cursor = 0;
    harness.rerender = false;
    harness.rendering = true;
    const result = FieldsProbe(props);
    harness.rendering = false;
    if (!harness.rerender) return result;
  }
  throw new Error('The hook kept updating its state while it rendered.');
}
const values = ({ name, handle, title, listed }: ReturnType<typeof render>) => ({ name, handle, title, listed });
beforeEach(() => {
  harness.cursor = 0;
  harness.rendering = false;
  harness.rerender = false;
  harness.effects = 0;
  harness.slots = [];
});
it('starts from the published profile, then the member name, then the account name', () => {
  expect(values(render({ existing: profile(), memberName: 'Member name' }))).toEqual({
    name: 'Published name',
    handle: 'published_handle',
    title: 'Published title',
    listed: true,
  });
  harness.slots = [];
  expect(values(render({ existing: null, memberName: 'Member name' }))).toEqual({
    name: 'Member name',
    handle: '',
    title: 'My games, my order',
    listed: false,
  });
  harness.slots = [];
  expect(render({ existing: null }).name).toBe('Auth name');
});
it('follows a profile and names that arrive later in the same frame, with no effect', () => {
  expect(render({ existing: null }).name).toBe('Auth name');
  expect(render({ existing: null, memberName: 'Member name' }).name).toBe('Member name');
  expect(values(render({ existing: profile(), memberName: 'Member name' }))).toEqual({
    name: 'Published name',
    handle: 'published_handle',
    title: 'Published title',
    listed: true,
  });
  expect(harness.effects).toBe(0);
});
it('keeps each field the user edited, while the others follow a newer profile', () => {
  const first = render({ existing: profile() });
  first.edit('name', 'My own name');
  first.edit('listed', false);
  expect(values(render({ existing: profile() }))).toEqual({
    name: 'My own name',
    handle: 'published_handle',
    title: 'Published title',
    listed: false,
  });
  const newer = profile({ displayName: 'Renamed', handle: 'new_handle', title: 'New title', listed: true });
  expect(values(render({ existing: newer, memberName: 'Member name' }))).toEqual({
    name: 'My own name',
    handle: 'new_handle',
    title: 'New title',
    listed: false,
  });
});
it('keeps the last published values while the profile is briefly missing', () => {
  render({ existing: profile() });
  expect(values(render({ existing: null, memberName: 'Member name' }))).toEqual({
    name: 'Published name',
    handle: 'published_handle',
    title: 'Published title',
    listed: true,
  });
});
