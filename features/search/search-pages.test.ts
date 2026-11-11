import { describe, expect, it, vi } from 'vitest';
import { createSearchPages } from './search-pages';
import type { LinkSearchResult } from '@/messaging/contracts';

const results = Array.from({ length: 8_352 }, (_, i) => ({ link: { id: `link-${i}` } }) as LinkSearchResult);
const bookmarks = Array.from({ length: 57 }, (_, i) => ({ id: `bookmark-${i}`, title: '', url: 'https://example.test' }));
const matches = { results, bookmarks };

describe('bounded search results', () => {
  it('returns every match in order, independently by category, with one underlying search', async () => {
    const find = vi.fn(async () => matches);
    const service = createSearchPages(find);
    const first = await service.search('needle', {});
    if (!first.success || !first.page) throw new Error('Expected initial page');
    expect(first.page).toMatchObject({ totalResults: results.length, totalBookmarks: bookmarks.length });
    for (const category of ['results', 'bookmarks'] as const) {
      const next = category === 'results' ? 'nextResults' : 'nextBookmarks';
      const items = [...first[category]];
      let offset = first.page[next];
      while (offset !== undefined) {
        const result = await service.search('needle', { cursor: first.page.cursor, category, offset });
        if (!result.success || !result.page) throw new Error('Expected continuation page');
        expect(result[category === 'results' ? 'bookmarks' : 'results']).toEqual([]);
        expect(result[category].length).toBeLessThanOrEqual(25);
        items.push(...result[category]);
        offset = result.page[next];
      }
      expect(items).toEqual(matches[category]);
    }
    expect(find).toHaveBeenCalledTimes(1);
    expect(await service.search('needle')).toEqual({ success: true, ...matches });
  });

  it('rejects invalid offsets, category, query, page size, and unknown cursors', async () => {
    const service = createSearchPages(async () => matches);
    const first = await service.search('needle', {});
    if (!first.success || !first.page) throw new Error('Expected initial page');
    const next = { cursor: first.page.cursor, category: 'results', offset: 25 };
    for (const input of [null, [], { limit: 5000 }, { ...next, offset: 1 }, { ...next, offset: 10_000 }, { ...next, category: 'unknown' }]) {
      expect(await service.search('needle', input)).toMatchObject({ success: false, error: { code: 'INVALID_SEARCH_PAGE' } });
    }
    expect(await service.search('other', next)).toMatchObject({ error: { code: 'INVALID_SEARCH_PAGE' } });
    expect(await service.search('needle', { ...next, cursor: 'unknown' })).toMatchObject({ error: { code: 'SEARCH_EXPIRED' } });
    const [one, two] = await Promise.all([service.search('needle', next), service.search('needle', next)]);
    expect(one).toEqual(two);
  });

  it('rejects continuation after expiration, invalidation, eviction, or restart', async () => {
    let time = 0;
    const find = async () => matches;
    const service = createSearchPages(find, () => time);
    const start = async () => {
      const first = await service.search('needle', {});
      if (!first.success || !first.page) throw new Error('Expected initial page');
      return { cursor: first.page.cursor, category: 'results', offset: 25 };
    };
    const stale = { error: { code: 'SEARCH_EXPIRED' } };
    const next = await start();
    time = 120_000;
    expect(await service.search('needle', next)).toMatchObject(stale);
    const restarted = await start();
    expect(await createSearchPages(find).search('needle', restarted)).toMatchObject(stale);
    service.invalidate();
    expect(await service.search('needle', restarted)).toMatchObject(stale);
    const evicted = await start();
    for (let i = 0; i < 4; i++) await start();
    expect(await service.search('needle', evicted)).toMatchObject(stale);
  });

  it('rejects a first page assembled across a change and supports empty queries', async () => {
    const pending = Promise.withResolvers<typeof matches>();
    const service = createSearchPages(() => pending.promise);
    const first = service.search('needle', {});
    service.invalidate();
    pending.resolve(matches);
    expect(await first).toMatchObject({ error: { code: 'SEARCH_EXPIRED' } });
    const empty = createSearchPages(async () => ({ results: [], bookmarks: [] }));
    expect(await empty.search(' ', {})).toMatchObject({
      success: true, results: [], bookmarks: [], page: { totalResults: 0, totalBookmarks: 0 },
    });
  });
});
