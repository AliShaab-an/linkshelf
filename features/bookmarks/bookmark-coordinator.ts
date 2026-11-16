import type { SavedLink } from '@/domain/schemas';
import { normalizeUrl } from '@/domain/url';
import type { BookmarkLinkMessage, BookmarkLinkResponse } from '@/messaging/contracts';
import { OperationCoordinator } from '@/features/operations/operation-coordinator';
import type { BookmarkLinkDependencies } from './bookmark-link';
import { executeBookmarkLink } from './bookmark-link';
import { flattenBookmarks, type BookmarkRecord } from './bookmark-tree';

export function createBookmarkCoordinator(operations: OperationCoordinator, dependencies: BookmarkLinkDependencies) {
  const created = new Map<string, { url: string; createdAt: string; bookmark: BookmarkRecord }>();
  return {
    convert(message: BookmarkLinkMessage): Promise<BookmarkLinkResponse> {
      return operations.reserve([`link:${message.payload.linkId}`], async () => {
        let link: SavedLink | undefined;
        let tracking: readonly string[];
        try {
          [link, tracking] = await Promise.all([dependencies.getLink(message.payload.linkId), dependencies.getTrackingParams()]);
        } catch {
          const receipt = created.get(message.payload.linkId);
          return {
            success: false, bookmarkCreated: Boolean(receipt), ...(receipt ? { bookmark: receipt.bookmark } : {}),
            error: { code: 'STORAGE_FAILED', message: 'LinkShelf could not read the saved link or settings. Check any previously created bookmark before retrying.' },
          };
        }
        if (!link || link.status !== 'parked') {
          created.delete(message.payload.linkId);
          return executeBookmarkLink(message, dependencies);
        }
        let key = link.url;
        try { key = normalizeUrl(link.url, tracking); } catch { /* The existing converter reports unsupported URLs. */ }
        return operations.enqueue(`bookmark-url:${key}`, async () => {
          let current: SavedLink | undefined;
          try {
            current = await dependencies.getLink(link.id);
          } catch {
            const receipt = created.get(link.id);
            return {
              success: false, bookmarkCreated: Boolean(receipt), ...(receipt ? { bookmark: receipt.bookmark } : {}),
              error: { code: 'STORAGE_FAILED', message: 'LinkShelf could not confirm the saved link before conversion. Check any previously created bookmark before retrying.' },
            };
          }
          if (!current || current.status !== 'parked' || current.url !== link.url || current.createdAt !== link.createdAt) return {
            success: false, bookmarkCreated: false,
            error: { code: 'LINK_NOT_PARKED', message: 'The saved link changed before conversion. Refresh LinkShelf before trying again.' },
          };
          const receipt = created.get(link.id);
          if (receipt?.url === link.url && receipt.createdAt === link.createdAt) {
            let exists = false;
            try {
              exists = flattenBookmarks(await dependencies.getBookmarkTree()).some((item) => item.id === receipt.bookmark.id && item.url === receipt.bookmark.url);
            } catch { /* Uncertain existence must never trigger another create. */ }
            if (!exists) return {
              success: false, bookmarkCreated: true, bookmark: receipt.bookmark,
              error: { code: 'BOOKMARK_RECOVERY_REQUIRED', message: 'A previous request created this bookmark, but Chrome cannot confirm it now. The saved link was kept. Check Chrome bookmarks before taking another action.' },
            };
            try {
              await dependencies.markLinkBookmarked(link.id, receipt.bookmark.id);
              created.delete(link.id);
              return { success: true, linkId: link.id, bookmark: receipt.bookmark };
            } catch {
              return {
                success: false, bookmarkCreated: true, bookmark: receipt.bookmark,
                error: { code: 'STORAGE_FAILED', message: 'The existing Chrome bookmark was preserved, but its LinkShelf state could not be confirmed. Check that bookmark before retrying the saved-state update.' },
              };
            }
          }
          let captured: SavedLink = link;
          const result = await executeBookmarkLink(message, {
            ...dependencies,
            getLink: async (id) => { const current = await dependencies.getLink(id); if (current) captured = current; return current; },
            createBookmark: async (input) => {
              const bookmark = await dependencies.createBookmark(input);
              created.set(captured.id, { url: captured.url, createdAt: captured.createdAt, bookmark });
              return bookmark;
            },
          });
          if (result.success) created.delete(link.id);
          return result;
        });
      });
    },
  };
}
