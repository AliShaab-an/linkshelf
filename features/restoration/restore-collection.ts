import type { SavedLink } from '@/domain/schemas';
import type { RestoreProgress } from '@/messaging/contracts';

export interface RestoreCollectionDependencies {
  openTab(url: string): Promise<RestoreTabOutcome>;
  markLinkRestored(linkId: string): Promise<SavedLink>;
}

export interface RestoreTabOutcome {
  discarded: boolean;
  fallback: boolean;
}

export interface RestoreCollectionOptions {
  markAsRestored: boolean;
}

export type RestoreCollectionResult =
  | {
      success: true;
      openedLinkIds: string[];
      restoredLinkIds: string[];
      failedLinkIds: string[];
      discardedLinkIds: string[];
      fallbackLinkIds: string[];
      complete: boolean;
    }
  | {
      success: false;
      opened: boolean;
      progress?: RestoreProgress;
      error: {
        code: 'TAB_OPEN_FAILED' | 'STORAGE_FAILED';
        message: string;
      };
    };

export async function restoreLinkCollection(
  links: SavedLink[],
  dependencies: RestoreCollectionDependencies,
  options: RestoreCollectionOptions,
): Promise<RestoreCollectionResult> {
  const openedLinkIds: string[] = [];
  const restoredLinkIds: string[] = [];
  const failedLinkIds: string[] = [];
  const discardedLinkIds: string[] = [];
  const fallbackLinkIds: string[] = [];

  for (const link of links) {
    let tabOutcome: RestoreTabOutcome;
    try {
      tabOutcome = await dependencies.openTab(link.url);
      openedLinkIds.push(link.id);
      if (tabOutcome.discarded) discardedLinkIds.push(link.id);
      if (tabOutcome.fallback) fallbackLinkIds.push(link.id);
    } catch {
      failedLinkIds.push(link.id);
      continue;
    }

    if (!options.markAsRestored) continue;

    try {
      await dependencies.markLinkRestored(link.id);
      restoredLinkIds.push(link.id);
    } catch {
      return {
        success: false,
        opened: true,
        progress: { openedLinkIds, restoredLinkIds, failedLinkIds, discardedLinkIds, fallbackLinkIds },
        error: {
          code: 'STORAGE_FAILED',
          message:
            `Opened ${openedLinkIds.length} tabs and confirmed ${restoredLinkIds.length} saved-state updates before storage failed. Unprocessed links remain parked. Check your open tabs and saved list before retrying.`,
        },
      };
    }
  }

  if (openedLinkIds.length === 0) {
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
    openedLinkIds,
    restoredLinkIds,
    failedLinkIds,
    discardedLinkIds,
    fallbackLinkIds,
    complete: failedLinkIds.length === 0,
  };
}
