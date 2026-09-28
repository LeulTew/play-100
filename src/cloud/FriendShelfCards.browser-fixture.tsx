import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { fixtureElement } from '../lib/browser-fixture';
import { FriendShelfCards } from './FriendShelfCards.tsx';
import { parseFriendShelfEntry } from '../lib/friend-shelf-types.ts';
const query = new URLSearchParams(location.search);
const entry = Object.freeze(
  parseFriendShelfEntry({
    id: 'manual:fixture',
    source: 'manual',
    sourceId: 'fixture',
    sourceUrl: null,
    title: query.get('title'),
    year: 2000,
  }),
);
const receipt: Window['friendShelfCardFixture'] = { title: entry.title, saved: [], pinned: [], opened: [] };
window.friendShelfCardFixture = receipt;
createRoot(fixtureElement('mount')).render(
  h(FriendShelfCards, {
    entries: [entry],
    status: 'ready',
    paged: query.get('paged') === 'true',
    total: 1,
    onSave: async (record) => {
      receipt.saved.push(record.title);
    },
    onPin: (record) => {
      receipt.pinned.push(record.title);
    },
    onOpen: (record) => {
      receipt.opened.push(record.title);
    },
  }),
);
