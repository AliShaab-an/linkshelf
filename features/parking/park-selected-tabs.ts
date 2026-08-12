import { isEligibleUrl } from '@/domain/url';
import type {
  ParkSelectedTabsMessage,
  ParkSelectedTabsResponse,
} from '@/messaging/contracts';
import type { ParkTabsInput, ParkTabsResult } from '@/storage/repository';
import type { BrowserTabSnapshot } from './park-current-tab';

export interface ParkSelectedTabsDependencies {
  getTab(tabId: number): Promise<BrowserTabSnapshot>;
  persistTabs(input: ParkTabsInput): Promise<ParkTabsResult>;
  closeTab(tabId: number): Promise<void>;
}

export async function executeParkSelectedTabs(
  message: ParkSelectedTabsMessage,
  dependencies: ParkSelectedTabsDependencies,
): Promise<ParkSelectedTabsResponse> {
  const tabs: BrowserTabSnapshot[] = [];

  for (const tabId of message.payload.tabIds) {
    try {
      const tab = await dependencies.getTab(tabId);

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

  let parkedRecords: ParkTabsResult;

  try {
    parkedRecords = await dependencies.persistTabs({
      projectId: message.payload.projectId,
      note: message.payload.note,
      reminderAt: message.payload.reminderAt,
      sourceWindowId: tabs[0].windowId,
      tabs: tabs.map((tab) => ({
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
      try {
        await dependencies.closeTab(tab.id!);
        return { tabId: tab.id!, closed: true as const };
      } catch {
        return { tabId: tab.id!, closed: false as const };
      }
    }),
  );

  return {
    success: true,
    saved: true,
    sessionId: parkedRecords.session.id,
    linkIds: parkedRecords.links.map((link) => link.id),
    closedTabIds: closeResults
      .filter((result) => result.closed)
      .map((result) => result.tabId),
    failedToCloseTabIds: closeResults
      .filter((result) => !result.closed)
      .map((result) => result.tabId),
  };
}
