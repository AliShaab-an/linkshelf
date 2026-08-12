import { describe, expect, it, vi } from 'vitest';
import type { SavedLink } from '@/domain/schemas';
import type { BookmarkLinkMessage } from '@/messaging/contracts';
import {
  executeBookmarkLink,
  type BookmarkLinkDependencies,
} from './bookmark-link';

const message: BookmarkLinkMessage = {
  type: 'BOOKMARK_LINK',
  payload: { linkId: 'link-1', parentId: 'folder-1' },
};

const link: SavedLink = {
  id: 'link-1', sessionId: 'session-1', projectId: 'inbox', title: 'Example',
  url: 'https://example.com/article?utm_source=test',
  normalizedUrl: 'https://example.com/article', domain: 'example.com',
  status: 'parked', pinnedBeforeParking: false,
  createdAt: '2026-08-10T12:00:00.000Z', updatedAt: '2026-08-10T12:00:00.000Z',
};

function dependencies(): BookmarkLinkDependencies {
  return {
    getLink: vi.fn().mockResolvedValue(link),
    getTrackingParams: vi.fn().mockResolvedValue(['utm_source']),
    getBookmarkTree: vi.fn().mockResolvedValue([]),
    createBookmark: vi.fn().mockResolvedValue({
      id: 'bookmark-1', parentId: 'folder-1', title: link.title, url: link.url,
    }),
    markLinkBookmarked: vi.fn().mockResolvedValue({
      ...link, status: 'removed' as const, bookmarkId: 'bookmark-1',
    }),
  };
}

describe('executeBookmarkLink', () => {
  it('creates the bookmark before retiring the parked link', async () => {
    const events: string[] = [];
    const deps = dependencies();
    deps.createBookmark = vi.fn(async (input) => {
      events.push('created');
      return { id: 'bookmark-1', ...input };
    });
    deps.markLinkBookmarked = vi.fn(async () => {
      events.push('updated');
      return { ...link, status: 'removed' as const };
    });

    const response = await executeBookmarkLink(message, deps);

    expect(events).toEqual(['created', 'updated']);
    expect(response).toMatchObject({ success: true, linkId: 'link-1' });
  });

  it('does not create a duplicate normalized bookmark', async () => {
    const deps = dependencies();
    deps.getBookmarkTree = vi.fn().mockResolvedValue([{
      id: 'root', title: '', children: [{
        id: 'existing', parentId: 'root', title: 'Already saved',
        url: 'https://EXAMPLE.com/article#section',
      }],
    }]);

    const response = await executeBookmarkLink(message, deps);

    expect(deps.createBookmark).not.toHaveBeenCalled();
    expect(deps.markLinkBookmarked).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false, bookmarkCreated: false,
      error: { code: 'DUPLICATE_BOOKMARK' },
      duplicates: [{ id: 'existing' }],
    });
  });

  it('reports that the bookmark exists when the LinkShelf update fails', async () => {
    const deps = dependencies();
    deps.markLinkBookmarked = vi.fn().mockRejectedValue(new Error('storage failed'));

    const response = await executeBookmarkLink(message, deps);

    expect(response).toMatchObject({
      success: false, bookmarkCreated: true,
      bookmark: { id: 'bookmark-1' }, error: { code: 'STORAGE_FAILED' },
    });
  });
});
