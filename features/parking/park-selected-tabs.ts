import { isEligibleUrl } from '@/domain/url';
import type {
  ParkSelectedTabsMessage,
  ParkSelectedTabsResponse,
} from '@/messaging/contracts';
import type { ParkTabsInput, ParkTabsResult } from '@/storage/repository';
import type { OriginalTabGroup } from '@/domain/tab-groups';
import { describeGroup, type BrowserTabSnapshot } from './park-current-tab';
import { closeSavedTab, type SafeTabCloseDependencies } from './safe-tab-close';

export interface ParkSelectedTabsDependencies extends SafeTabCloseDependencies {
  persistTabs(input: ParkTabsInput): Promise<ParkTabsResult>;
  /** Describes a tab's group so it can be restored. Optional: unavailable without the tabGroups permission. */
  describeGroup?(groupId: number): Promise<OriginalTabGroup | undefined>;
  /** Returns the URLs that already exist as parked links. */
  findParkedDuplicateUrls(urls: string[]): Promise<string[]>;
}

export async function executeParkSelectedTabs(
  message: ParkSelectedTabsMessage,
  dependencies: ParkSelectedTabsDependencies,
): Promise<ParkSelectedTabsResponse> {
  const tabs: BrowserTabSnapshot[] = [];

  for (const tabId of message.payload.tabIds) {
    try {
      const tab = { ...await dependencies.getTab(tabId) };

      if (tab.id === undefined || !tab.url) {
        throw new Error('Unreadable tab');
      }

      tabs.push(tab);
    } catch {
      return {
        success: false,
        saved: false,
        closedTabIds: [],
        error: {
          code: 'TAB_NOT_FOUND',
          message: 'A selected tab no longer exists. Refresh the list and try again.',
        },
      };
    }
  }

  if (tabs.some((tab) => !tab.url || !isEligibleUrl(tab.url) || tab.pinned)) {
    return {
      success: false,
      saved: false,
      closedTabIds: [],
      error: {
        code: 'TAB_NOT_ELIGIBLE',
        message: 'A selected tab became pinned or restricted. Nothing was saved or closed.',
      },
    };
  }

  const windowIds = new Set(tabs.map((tab) => tab.windowId));

  if (windowIds.size !== 1) {
    return {
      success: false,
      saved: false,
      closedTabIds: [],
      error: {
        code: 'TABS_MOVED',
        message: 'Selected tabs must remain in the same window. Nothing was saved or closed.',
      },
    };
  }

  let parkedRecords: ParkTabsResult | undefined;
  let skipped: BrowserTabSnapshot[] = [];
  let toPark = tabs;

  try {
    if (message.payload.duplicates === 'skip') {
      const duplicateUrls = new Set(await dependencies.findParkedDuplicateUrls(tabs.map((tab) => tab.url!)));
      skipped = tabs.filter((tab) => duplicateUrls.has(tab.url!));
      toPark = tabs.filter((tab) => !duplicateUrls.has(tab.url!));
    }

    // One lookup per group, not per tab.
    const groups = new Map<number, Promise<OriginalTabGroup | undefined>>();
    const groupOf = (tab: BrowserTabSnapshot) => {
      if (tab.groupId === undefined || tab.groupId < 0) return Promise.resolve(undefined);
      if (!groups.has(tab.groupId)) groups.set(tab.groupId, describeGroup(dependencies, tab.groupId));
      return groups.get(tab.groupId)!;
    };
    const originalGroups = await Promise.all(toPark.map(groupOf));

    if (toPark.length > 0) parkedRecords = await dependencies.persistTabs({
      projectId: message.payload.projectId,
      note: message.payload.note,
      reminderAt: message.payload.reminderAt,
      sourceWindowId: tabs[0].windowId,
      tabs: toPark.map((tab, index) => ({
        ...(originalGroups[index] ? { originalGroup: originalGroups[index] } : {}),
        title: tab.title || 'Untitled tab',
        url: tab.url!,
        faviconUrl: tab.favIconUrl,
        pinnedBeforeParking: tab.pinned,
        originalIndex: tab.index,
      })),
    });
  } catch (error) {
    console.error('Failed to persist selected tabs:', error);

    return {
      success: false,
      saved: false,
      closedTabIds: [],
      error: {
        code: 'STORAGE_FAILED',
        message: 'All tabs stayed open because LinkShelf could not save the selection.',
      },
    };
  }

  const closeResults = await Promise.all(
    tabs.map(async (tab) => {
      const closure = await closeSavedTab(tab, dependencies);
      return { tabId: tab.id!, closed: closure === 'closed', closure };
    }),
  );

  return {
    success: true,
    saved: true,
    ...(parkedRecords ? { sessionId: parkedRecords.session.id } : {}),
    linkIds: parkedRecords?.links.map((link) => link.id) ?? [],
    ...(skipped.length ? { skippedDuplicateTabIds: skipped.map((tab) => tab.id!) } : {}),
    closedTabIds: closeResults
      .filter((result) => result.closed)
      .map((result) => result.tabId),
    failedToCloseTabIds: closeResults
      .filter((result) => !result.closed)
      .map((result) => result.tabId),
    ...(closeResults.some((result) => result.closure === 'changed' || result.closure === 'unavailable')
      ? { warnings: ['Saved snapshots were kept. Changed or unreadable tabs were not closed by LinkShelf.'] }
      : {}),
  };
}
