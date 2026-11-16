import { isEligibleUrl } from '@/domain/url';
import type {
  ParkCurrentTabMessage,
  ParkCurrentTabResponse,
} from '@/messaging/contracts';
import type { ParkTabInput, ParkTabResult } from '@/storage/repository';
import { closeSavedTab, type SafeTabCloseDependencies } from './safe-tab-close';

export interface BrowserTabSnapshot {
  id?: number;
  title?: string;
  url?: string;
  pendingUrl?: string;
  status?: string;
  favIconUrl?: string;
  windowId: number;
  index: number;
  pinned: boolean;
}

export interface ParkCurrentTabDependencies extends SafeTabCloseDependencies {
  persistTab(input: ParkTabInput): Promise<ParkTabResult>;
}

export async function executeParkCurrentTab(
  message: ParkCurrentTabMessage,
  dependencies: ParkCurrentTabDependencies,
): Promise<ParkCurrentTabResponse> {
  let tab: BrowserTabSnapshot;

  try {
    tab = { ...await dependencies.getTab(message.payload.tabId) };
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

  const closure = await closeSavedTab(tab, dependencies);
  if (closure !== 'closed') {
    return {
      success: false,
      saved: true,
      closed: false,
      linkId: parkedRecords.link.id,
      sessionId: parkedRecords.session.id,
      error: {
        code: closure === 'changed' ? 'TAB_CHANGED' : 'TAB_CLOSE_FAILED',
        message: closure === 'changed'
          ? 'The original page was saved, but the tab changed. LinkShelf left it untouched.'
          : closure === 'unavailable'
            ? 'The page was saved, but Chrome could not verify the tab before closing. LinkShelf did not close it.'
            : 'The tab was saved, but Chrome did not confirm closing it. Check your open tabs before retrying.',
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
