import type { SavedLink } from '@/domain/schemas';
import type { RestoreProgress } from '@/messaging/contracts';
import { sameRestoreIdentity } from '@/domain/restore-identity';

export const RESTORE_CHECKPOINT_SIZE = 2;

export interface RestoreCollectionDependencies {
  openTab(url: string, link?: SavedLink): Promise<RestoreTabOutcome>;
  getLink?(id: string): Promise<SavedLink | undefined>;
  markLinkRestored(linkId: string): Promise<SavedLink>;
  markLinksRestoredBatch?(confirmed: readonly SavedLink[]): Promise<void>;
}

export interface RestoreTabOutcome {
  discarded: boolean;
  fallback: boolean;
}

export interface RestoreCollectionOptions {
  markAsRestored: boolean;
}

export type RestoreCollectionResult = { warnings?: string[] } & (
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
    }
);

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
  const pending: SavedLink[] = [];
  const checkpointSize = dependencies.markLinksRestoredBatch ? RESTORE_CHECKPOINT_SIZE : 1;

  async function checkpoint() {
    if (!pending.length) return;
    if (dependencies.markLinksRestoredBatch) await dependencies.markLinksRestoredBatch(pending);
    else await dependencies.markLinkRestored(pending[0].id);
    restoredLinkIds.push(...pending.map(link => link.id));
    pending.length = 0;
  }

  function storageFailure(unprocessed: number): RestoreCollectionResult {
    return {
      success: false,
      opened: openedLinkIds.length > 0,
      progress: { openedLinkIds, restoredLinkIds, failedLinkIds, discardedLinkIds, fallbackLinkIds },
      error: {
        code: 'STORAGE_FAILED',
        message: `Confirmed opening ${openedLinkIds.length} tabs and saving ${restoredLinkIds.length} restored records before storage could not be verified. ${unprocessed === 1 ? '1 link was' : `${unprocessed} links were`} not attempted. Check your tabs and saved list before retrying.`,
      },
    };
  }

  for (const [index, link] of links.entries()) {
    if (pending.length && index % checkpointSize === 0) {
      try {
        await checkpoint();
      } catch {
        return storageFailure(links.length - index);
      }
    }
    let current = link;
    if (dependencies.getLink) {
      try {
        const saved = await dependencies.getLink(link.id);
        if (!saved || saved.status !== 'parked' || !sameRestoreIdentity(saved, link)) {
          failedLinkIds.push(link.id);
          continue;
        }
        current = saved;
      } catch {
        return storageFailure(links.length - index);
      }
    }
    let tabOutcome: RestoreTabOutcome;
    try {
      tabOutcome = dependencies.getLink
        ? await dependencies.openTab(current.url, current)
        : await dependencies.openTab(current.url);
      openedLinkIds.push(link.id);
      if (tabOutcome.discarded) discardedLinkIds.push(link.id);
      if (tabOutcome.fallback) fallbackLinkIds.push(link.id);
    } catch {
      failedLinkIds.push(link.id);
      continue;
    }

    if (options.markAsRestored) pending.push(current);
  }
  if (pending.length) {
    try {
      await checkpoint();
    } catch {
      return storageFailure(0);
    }
  }

  if (openedLinkIds.length === 0) {
    return {
      success: false,
      opened: false,
      error: {
        code: 'TAB_OPEN_FAILED',
        message: 'Chrome did not confirm opening any links. Saved records stayed parked. Check open tabs before retrying.',
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
    ...(failedLinkIds.length ? { warnings: ['Some browser opens were not confirmed. Check open tabs before retrying those saved links.'] } : {}),
  };
}
