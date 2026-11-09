import type { SavedLink } from '@/domain/schemas';
import type {
  BookmarkLinkMessage,
  BookmarkLinkResponse,
} from '@/messaging/contracts';
import {
  findBookmarkDuplicates,
  type BookmarkRecord,
  type BookmarkTreeNodeLike,
} from './bookmark-tree';

export interface BookmarkLinkDependencies {
  getLink(linkId: string): Promise<SavedLink | undefined>;
  getTrackingParams(): Promise<readonly string[]>;
  getBookmarkTree(): Promise<BookmarkTreeNodeLike[]>;
  createBookmark(input: {
    parentId: string;
    title: string;
    url: string;
  }): Promise<BookmarkRecord>;
  markLinkBookmarked(linkId: string, bookmarkId: string): Promise<SavedLink>;
}

export async function executeBookmarkLink(
  message: BookmarkLinkMessage,
  dependencies: BookmarkLinkDependencies,
): Promise<BookmarkLinkResponse> {
  let link: SavedLink | undefined;

  try {
    link = await dependencies.getLink(message.payload.linkId);
  } catch (error) {
    console.error('Failed to read a link before bookmarking it:', error);
    return failure('STORAGE_FAILED', 'LinkShelf could not read this saved link.');
  }

  if (!link) {
    return failure('LINK_NOT_FOUND', 'This saved link no longer exists.');
  }
  if (link.status !== 'parked') {
    return failure('LINK_NOT_PARKED', 'Only parked links can become bookmarks.');
  }

  try {
    const [tree, trackingParams] = await Promise.all([
      dependencies.getBookmarkTree(),
      dependencies.getTrackingParams(),
    ]);
    const duplicates = findBookmarkDuplicates(tree, link.url, trackingParams);

    if (duplicates.length > 0) {
      return {
        ...failure(
          'DUPLICATE_BOOKMARK',
          'Chrome already has a bookmark for this URL. The link stayed parked.',
        ),
        duplicates,
      };
    }
  } catch (error) {
    console.error('Failed to check existing Chrome bookmarks:', error);
    return failure(
      'BOOKMARK_CREATE_FAILED',
      'LinkShelf could not check Chrome bookmarks. The link stayed parked.',
    );
  }

  let bookmark: BookmarkRecord;
  try {
    bookmark = await dependencies.createBookmark({
      parentId: message.payload.parentId,
      title: link.title,
      url: link.url,
    });
  } catch (error) {
    console.error('Failed to create a Chrome bookmark:', error);
    return failure(
      'BOOKMARK_CREATE_FAILED',
      'Chrome could not create the bookmark. The link stayed parked.',
    );
  }

  try {
    await dependencies.markLinkBookmarked(link.id, bookmark.id);
  } catch (error) {
    console.error('Bookmark created but LinkShelf state update failed:', error);
    return {
      success: false,
      bookmarkCreated: true,
      bookmark,
      error: {
        code: 'STORAGE_FAILED',
        message: 'The Chrome bookmark was created, but its LinkShelf state could not be confirmed. Check the existing bookmark before retrying.',
      },
    };
  }

  return { success: true, linkId: link.id, bookmark };
}

function failure(
  code: Extract<BookmarkLinkResponse, { success: false }>['error']['code'],
  message: string,
): Extract<BookmarkLinkResponse, { success: false }> {
  return {
    success: false,
    bookmarkCreated: false,
    error: { code, message },
  };
}
