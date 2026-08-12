import { isEligibleUrl } from '@/domain/url';
import type {
  ParkCurrentTabMessage,
  ParkCurrentTabResponse,
} from '@/messaging/contracts';
import type { ParkTabInput, ParkTabResult } from '@/storage/repository';

export interface BrowserTabSnapshot {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  windowId: number;
  index: number;
  pinned: boolean;
}

export interface ParkCurrentTabDependencies {
  getTab(tabId: number): Promise<BrowserTabSnapshot>;
  persistTab(input: ParkTabInput): Promise<ParkTabResult>;
  closeTab(tabId: number): Promise<void>;
}

export async function executeParkCurrentTab(
  message: ParkCurrentTabMessage,
  dependencies: ParkCurrentTabDependencies,
): Promise<ParkCurrentTabResponse> {
  let tab: BrowserTabSnapshot;

  try {
    tab = await dependencies.getTab(message.payload.tabId);
  } catch {
    return {
      success: false,
      saved: false,
      closed: false,
      error: {
        code: 'TAB_NOT_FOUND',
        message: 'Chrome could not find this tab. It was not saved or closed.',
      },
    };
  }

  if (tab.id === undefined || !tab.url) {
    return {
      success: false,
      saved: false,
      closed: false,
      error: {
        code: 'TAB_NOT_FOUND',
        message: 'Chrome could not read this tab. It was not saved or closed.',
      },
    };
  }

  if (!isEligibleUrl(tab.url)) {
    return {
      success: false,
      saved: false,
      closed: false,
      error: {
        code: 'TAB_NOT_ELIGIBLE',
        message: 'This type of Chrome page cannot be parked.',
      },
    };
  }

  let parkedRecords: ParkTabResult;

  try {
    parkedRecords = await dependencies.persistTab({
      projectId: message.payload.projectId,
      note: message.payload.note,
      reminderAt: message.payload.reminderAt,
      title: tab.title || 'Untitled tab',
      url: tab.url,
      faviconUrl: tab.favIconUrl,
      sourceWindowId: tab.windowId,
      pinnedBeforeParking: tab.pinned,
      originalIndex: tab.index,
    });
  } catch (error) {
    console.error('Failed to persist a parked tab:', error);

    return {
      success: false,
      saved: false,
      closed: false,
      error: {
        code: 'STORAGE_FAILED',
        message: 'The tab stayed open because LinkShelf could not save it.',
      },
    };
  }

  try {
    await dependencies.closeTab(tab.id);
  } catch (error) {
    console.error('The parked tab was saved but could not be closed:', error);

    return {
      success: false,
      saved: true,
      closed: false,
      linkId: parkedRecords.link.id,
      sessionId: parkedRecords.session.id,
      error: {
        code: 'TAB_CLOSE_FAILED',
        message: 'The tab was saved, but Chrome could not close it.',
      },
    };
  }

  return {
    success: true,
    saved: true,
    closed: true,
    linkId: parkedRecords.link.id,
    sessionId: parkedRecords.session.id,
  };
}
