import type { SavedLink } from '@/domain/schemas';
import type {
  RestoreSessionMessage,
  RestoreSessionResponse,
} from '@/messaging/contracts';
import {
  restoreLinkCollection,
  type RestoreCollectionDependencies,
} from './restore-collection';

export interface RestoreSessionDependencies extends RestoreCollectionDependencies {
  getParkedLinks(sessionId: string): Promise<SavedLink[]>;
}

export async function executeRestoreSession(
  message: RestoreSessionMessage,
  dependencies: RestoreSessionDependencies,
): Promise<RestoreSessionResponse> {
  let links: SavedLink[];

  try {
    links = await dependencies.getParkedLinks(message.payload.sessionId);
  } catch {
    return {
      success: false,
      opened: false,
      error: {
        code: 'STORAGE_FAILED',
        message: 'LinkShelf could not read this parking session.',
      },
    };
  }

  if (links.length === 0) {
    return {
      success: false,
      opened: false,
      error: {
        code: 'SESSION_EMPTY',
        message: 'This session has no parked links left to restore.',
      },
    };
  }

  const result = await restoreLinkCollection(links, dependencies);

  if (!result.success) return result;

  return {
    success: true,
    sessionId: message.payload.sessionId,
    restoredLinkIds: result.restoredLinkIds,
    failedLinkIds: result.failedLinkIds,
    complete: result.complete,
  };
}
