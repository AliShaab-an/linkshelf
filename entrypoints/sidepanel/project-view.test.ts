import { describe, expect, it } from 'vitest';
import type { ParkedSessionGroup } from '@/messaging/contracts';
import {
  collectTagCounts,
  filterAndSortProjectGroups,
  groupSessionsByDay,
  PROJECT_LINK_BATCH_SIZE,
  visibleProjectLinks,
} from './project-view';

const now = '2026-08-22T10:00:00.000Z';

function group(id: string, createdAt: string, count: number, note?: string): ParkedSessionGroup {
  return {
    session: { id, projectId: 'inbox', createdAt, updatedAt: createdAt, note },
    links: Array.from({ length: count }, (_, index) => ({
      id: `${id}-link-${index}`,
      sessionId: id,
      projectId: 'inbox',
      title: index === 2 ? 'React guide' : `Reference ${index}`,
      url: `https://${index === 3 ? 'special.dev' : 'example.com'}/${index}`,
      normalizedUrl: `https://${index === 3 ? 'special.dev' : 'example.com'}/${index}`,
      domain: index === 3 ? 'special.dev' : 'example.com',
      note: index === 4 ? 'Read before launch' : undefined,
      status: 'parked' as const,
      pinnedBeforeParking: false,
      originalIndex: index,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

describe('project view helpers', () => {
  const older = group('older', '2026-08-20T10:00:00.000Z', 60, 'Client research');
  const newer = group('newer', '2026-08-21T10:00:00.000Z', 3);

  it('sorts sessions while preserving original link order', () => {
    const newest = filterAndSortProjectGroups([older, newer], '', 'newest');
    const oldest = filterAndSortProjectGroups([older, newer], '', 'oldest');
    expect(newest.map((item) => item.session.id)).toEqual(['newer', 'older']);
    expect(oldest.map((item) => item.session.id)).toEqual(['older', 'newer']);
    expect(oldest[0].links.map((link) => link.originalIndex)).toEqual(Array.from({ length: 60 }, (_, index) => index));
  });

  it('filters titles, domains, link notes, and session notes', () => {
    expect(filterAndSortProjectGroups([older], 'React', 'newest')[0].links).toHaveLength(1);
    expect(filterAndSortProjectGroups([older], 'special.dev', 'newest')[0].links[0].originalIndex).toBe(3);
    expect(filterAndSortProjectGroups([older], 'before launch', 'newest')[0].links[0].originalIndex).toBe(4);
    expect(filterAndSortProjectGroups([older], 'client research', 'newest')[0].links).toHaveLength(60);
  });

  describe('tags', () => {
    const tagged = group('tagged', '2026-08-21T10:00:00.000Z', 4);
    tagged.links[0] = { ...tagged.links[0], tags: ['work', 'read later'] };
    tagged.links[1] = { ...tagged.links[1], tags: ['work'] };
    tagged.links[3] = { ...tagged.links[3], tags: ['ideas'] };

    it('filters by an exact tag and combines it with text filtering', () => {
      expect(filterAndSortProjectGroups([tagged], '', 'newest', 'work')[0].links.map((link) => link.originalIndex)).toEqual([0, 1]);
      expect(filterAndSortProjectGroups([tagged], 'reference 1', 'newest', 'work')[0].links.map((link) => link.originalIndex)).toEqual([1]);
      expect(filterAndSortProjectGroups([tagged], '', 'newest', 'work2')).toEqual([]);
      expect(filterAndSortProjectGroups([tagged], '', 'newest', 'wor')).toEqual([]);
    });

    it('matches tags in the text filter and keeps the original link order', () => {
      expect(filterAndSortProjectGroups([tagged], 'ideas', 'newest')[0].links.map((link) => link.originalIndex)).toEqual([3]);
      expect(filterAndSortProjectGroups([tagged], '', 'newest')[0].links).toHaveLength(4);
    });

    it('counts tags across groups, most used first then alphabetically', () => {
      expect(collectTagCounts([tagged, older])).toEqual([
        { tag: 'work', count: 2 }, { tag: 'ideas', count: 1 }, { tag: 'read later', count: 1 },
      ]);
      expect(collectTagCounts([newer])).toEqual([]);
    });
  });

  it('reveals large sessions in batches without reordering', () => {
    expect(visibleProjectLinks(older)).toHaveLength(PROJECT_LINK_BATCH_SIZE);
    expect(visibleProjectLinks(older, 50)).toHaveLength(50);
    expect(visibleProjectLinks(older, older.links.length).map((link) => link.id)).toEqual(older.links.map((link) => link.id));
  });

  it('separates equal timestamps and groups by local calendar day with titles sorted within days', () => {
    const today = new Date(2026, 8, 26, 10);
    const yesterday = new Date(2026, 8, 25, 23);
    const a = group('a', today.toISOString(), 1);
    const b = group('b', today.toISOString(), 1);
    const c = group('c', yesterday.toISOString(), 1);
    a.links[0].title = 'Zebra';
    b.links[0].title = 'apricot';
    c.links[0].title = 'Apple';
    const sorted = filterAndSortProjectGroups([a, b, c], '', 'title');
    expect(sorted.map(item => item.session.id)).toEqual(['c', 'b', 'a']);
    expect(groupSessionsByDay(sorted, 'title', today).map(day => [day.label, day.sessions.map(item => item.session.id)]))
      .toEqual([['Today', ['b', 'a']], ['Yesterday', ['c']]]);
  });
});

