import type { SavedLink } from '@/domain/schemas';
import type {
  RestoreProjectMessage,
  RestoreProjectResponse,
} from '@/messaging/contracts';
import {
  restoreLinkCollection,
  type RestoreCollectionDependencies,
} from './restore-collection';

export interface RestoreProjectDependencies extends RestoreCollectionDependencies {
  getParkedLinks(projectId: string): Promise<SavedLink[]>;
  markAsRestored: boolean;
}

export async function executeRestoreProject(
  message: RestoreProjectMessage,
  dependencies: RestoreProjectDependencies,
): Promise<RestoreProjectResponse> {
  let links: SavedLink[];

  try {
    links = await dependencies.getParkedLinks(message.payload.projectId);
  } catch {
    return {
      success: false,
      opened: false,
      error: {
        code: 'STORAGE_FAILED',
        message: 'LinkShelf could not read this project.',
      },
    };
  }

  if (links.length === 0) {
    return {
      success: false,
      opened: false,
      error: {
        code: 'PROJECT_EMPTY',
        message: 'This project has no parked links to restore.',
      },
    };
  }

  const result = await restoreLinkCollection(links, dependencies, {
    markAsRestored: dependencies.markAsRestored,
  });
  if (!result.success) return result;

  return {
    success: true,
    projectId: message.payload.projectId,
    openedLinkIds: result.openedLinkIds,
    restoredLinkIds: result.restoredLinkIds,
    failedLinkIds: result.failedLinkIds,
    discardedLinkIds: result.discardedLinkIds,
    fallbackLinkIds: result.fallbackLinkIds,
    complete: result.complete,
    ...(result.warnings ? { warnings: result.warnings } : {}),
  };
}
