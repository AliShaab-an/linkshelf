import type { SavedLink } from '@/domain/schemas';

export interface RestoreCollectionDependencies {
  openTab(url: string): Promise<void>;
  markLinkRestored(linkId: string): Promise<SavedLink>;
}

export type RestoreCollectionResult =
  | {
      success: true;
      restoredLinkIds: string[];
      failedLinkIds: string[];
      complete: boolean;
    }
  | {
      success: false;
      opened: boolean;
      error: {
        code: 'TAB_OPEN_FAILED' | 'STORAGE_FAILED';
        message: string;
      };
    };

export async function restoreLinkCollection(
  links: SavedLink[],
  dependencies: RestoreCollectionDependencies,
): Promise<RestoreCollectionResult> {
  const restoredLinkIds: string[] = [];
  const failedLinkIds: string[] = [];

  for (const link of links) {
    try {
      await dependencies.openTab(link.url);
    } catch {
      failedLinkIds.push(link.id);
      continue;
    }

    try {
      await dependencies.markLinkRestored(link.id);
      restoredLinkIds.push(link.id);
    } catch {
      return {
        success: false,
        opened: true,
        error: {
          code: 'STORAGE_FAILED',
          message:
            'A tab opened, but LinkShelf could not update its stored state. Remaining links stayed parked.',
        },
      };
    }
  }

  if (restoredLinkIds.length === 0) {
    return {
      success: false,
      opened: false,
      error: {
        code: 'TAB_OPEN_FAILED',
        message: 'Chrome could not open any links. Everything stayed parked.',
      },
    };
  }

  return {
    success: true,
    restoredLinkIds,
    failedLinkIds,
    complete: failedLinkIds.length === 0,
  };
}
