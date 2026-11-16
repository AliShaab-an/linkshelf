import type { SearchLinksResponse, SearchPage } from '@/messaging/contracts';

const PAGE_SIZE = 25;
const MAX_SEARCHES = 4;
const IDLE_TIMEOUT = 120_000;

type Matches = Pick<Extract<SearchLinksResponse, { success: true }>, 'results' | 'bookmarks'>;
type Category = keyof Matches;
type Snapshot = Matches & { query: string; expiresAt: number };

const expired = () => ({
  success: false as const,
  error: { code: 'SEARCH_EXPIRED' as const, message: 'Search results changed or expired. Search again to see current results.' },
});
const invalid = () => ({
  success: false as const,
  error: { code: 'INVALID_SEARCH_PAGE' as const, message: 'This search page is invalid.' },
});

export function createSearchPages(find: (query: string) => Promise<Matches>, now = Date.now) {
  const snapshots = new Map<string, Snapshot>();
  let generation = 0;

  function page(cursor: string, matches: Matches, category?: Category, offset = 0): SearchLinksResponse {
    const results = category === 'bookmarks' ? [] : matches.results.slice(offset, offset + PAGE_SIZE);
    const bookmarks = category === 'results' ? [] : matches.bookmarks.slice(offset, offset + PAGE_SIZE);
    const info: SearchPage = { cursor, totalResults: matches.results.length, totalBookmarks: matches.bookmarks.length };
    if (results.length && offset + results.length < info.totalResults) info.nextResults = offset + results.length;
    if (bookmarks.length && offset + bookmarks.length < info.totalBookmarks) info.nextBookmarks = offset + bookmarks.length;
    return { success: true, results, bookmarks, page: info };
  }

  async function search(query: string, request?: unknown): Promise<SearchLinksResponse> {
    if (request === undefined) return { success: true, ...await find(query) };
    if (!request || typeof request !== 'object' || Array.isArray(request)) return invalid();

    const key = query.trim();
    const time = now();
    for (const [cursor, snapshot] of snapshots) {
      if (snapshot.expiresAt <= time) snapshots.delete(cursor);
    }
    if (Object.keys(request).length === 0) {
      const started = generation;
      const matches = await find(key);
      if (started !== generation) return expired();
      const cursor = crypto.randomUUID();
      if (matches.results.length > PAGE_SIZE || matches.bookmarks.length > PAGE_SIZE) {
        if (snapshots.size >= MAX_SEARCHES) snapshots.delete(snapshots.keys().next().value!);
        snapshots.set(cursor, { ...matches, query: key, expiresAt: now() + IDLE_TIMEOUT });
      }
      return page(cursor, matches);
    }

    const { cursor, category, offset } = request as Record<string, unknown>;
    if (typeof cursor !== 'string' || !cursor ||
        (category !== 'results' && category !== 'bookmarks') ||
        typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset <= 0 || offset % PAGE_SIZE !== 0 ||
        Object.keys(request).length !== 3) return invalid();
    const snapshot = snapshots.get(cursor);
    if (!snapshot) return expired();
    if (snapshot.query !== key || offset >= snapshot[category].length) return invalid();
    snapshots.delete(cursor);
    snapshots.set(cursor, { ...snapshot, expiresAt: time + IDLE_TIMEOUT });
    return page(cursor, snapshot, category, offset);
  }

  return {
    search,
    invalidate() {
      generation++;
      snapshots.clear();
    },
  };
}
