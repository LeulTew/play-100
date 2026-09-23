import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import indexes from '../../firestore.indexes.json';
import { FRIEND_ALL_TRACKED_WRITE_GROUP } from './friend-all-transport';

describe('counted All-sharing production query indexes', () => {
  it('pins the only creator-attributed capacity cleanup query to its exact index', () => {
    expect(indexes.indexes.filter(index => index.collectionGroup === 'friendPairs' && index.fields.some(field => field.fieldPath === 'creatorUid')))
      .toEqual([{
        collectionGroup: 'friendPairs', queryScope: 'COLLECTION', fields: [
          { fieldPath: 'participants', arrayConfig: 'CONTAINS' },
          { fieldPath: 'creatorUid', order: 'ASCENDING' },
          { fieldPath: 'state', order: 'ASCENDING' },
          { fieldPath: 'updatedAt', order: 'ASCENDING' },
        ],
      }]);
    const store = readFileSync(new URL('../cloud/friend-store.ts', import.meta.url), 'utf8');
    expect(store).toContain("where('participants', 'array-contains', uid), where('creatorUid', '==', uid)");
    expect(store).toContain("where('state', 'in', ['cancelled', 'removed', 'declined']), orderBy('updatedAt')");
  });
  it.each(['entry.title', 'entry.position'])('declares the exact format/epoch/active query shape with %s ordering', ordered => {
    const fields = ['format', 'epoch', 'active', ordered].map(fieldPath => ({ fieldPath, order: 'ASCENDING' }));
    expect(indexes.indexes).toContainEqual({ collectionGroup: 'entries', queryScope: 'COLLECTION', fields });
  });
  it('pins the counted one-row step and format-aware query source beside the existing legacy path', () => {
    expect(FRIEND_ALL_TRACKED_WRITE_GROUP).toBe(1);
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    expect(rules).toContain("after.last.size() == 1 && after.applied == before.applied + 1");
    const store = readFileSync(new URL('../cloud/friend-all-store.ts', import.meta.url), 'utf8');
    expect(store).toContain("head.format === 3 ? [where('format', '==', 3)] : []");
    expect(store.match(/where\('format', '==', 3\)/g)).toHaveLength(1);
    expect(store).toContain("if (before?.format === 3 && row.format === 2) continue;");
    expect(store).toContain("orderBy(kind === 'games' ? 'entry.title' : 'entry.position')");
    expect(indexes.indexes.filter(index => index.collectionGroup === 'entries' && index.fields[0]?.fieldPath === 'format'))
      .toHaveLength(2);
  });
});
