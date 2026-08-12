import { describe, expect, it, vi } from 'vitest';
import type { ParkSelectedTabsMessage } from '@/messaging/contracts';
import type { ParkTabsResult } from '@/storage/repository';
import {
  executeParkSelectedTabs,
  type ParkSelectedTabsDependencies,
} from './park-selected-tabs';

const message: ParkSelectedTabsMessage = {
  type: 'PARK_SELECTED_TABS',
  payload: {
    tabIds: [10, 11],
    projectId: 'inbox',
    note: 'Shared research',
    reminderAt: '2099-08-12T09:00:00.000Z',
  },
};

const tabs = [
  {
    id: 10,
    title: 'First',
    url: 'https://first.example.com',
    windowId: 3,
    index: 1,
    pinned: false,
  },
  {
    id: 11,
    title: 'Second',
    url: 'https://second.example.com',
    windowId: 3,
    index: 2,
    pinned: false,
  },
];

const parkedRecords: ParkTabsResult = {
  session: {
    id: 'session-1',
    projectId: 'inbox',
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z',
  },
  links: tabs.map((tab) => ({
    id: `link-${tab.id}`,
    sessionId: 'session-1',
    projectId: 'inbox',
    title: tab.title,
    url: tab.url,
    normalizedUrl: tab.url,
    domain: new URL(tab.url).hostname,
    status: 'parked' as const,
    pinnedBeforeParking: false,
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z',
  })),
};

function createDependencies(): ParkSelectedTabsDependencies {
  return {
    getTab: vi.fn(async (tabId) => tabs.find((tab) => tab.id === tabId)!),
    persistTabs: vi.fn().mockResolvedValue(parkedRecords),
    closeTab: vi.fn().mockResolvedValue(undefined),
  };
}

describe('executeParkSelectedTabs', () => {
  it('persists one shared session before closing any tabs', async () => {
    const events: string[] = [];
    const dependencies = createDependencies();
    dependencies.persistTabs = vi.fn(async () => {
      events.push('saved');
      return parkedRecords;
    });
    dependencies.closeTab = vi.fn(async (tabId) => {
      events.push(`closed-${tabId}`);
    });

    const response = await executeParkSelectedTabs(message, dependencies);

    expect(events[0]).toBe('saved');
    expect(dependencies.persistTabs).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'inbox',
        note: 'Shared research',
        tabs: expect.arrayContaining([
          expect.objectContaining({ title: 'First' }),
          expect.objectContaining({ title: 'Second' }),
        ]),
      }),
    );
    expect(response).toMatchObject({
      success: true,
      sessionId: 'session-1',
      closedTabIds: expect.arrayContaining([10, 11]),
      failedToCloseTabIds: [],
    });
  });

  it('keeps every tab open when storage fails', async () => {
    const dependencies = createDependencies();
    dependencies.persistTabs = vi.fn().mockRejectedValue(new Error('failed'));

    const response = await executeParkSelectedTabs(message, dependencies);

    expect(dependencies.closeTab).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false,
      saved: false,
      error: { code: 'STORAGE_FAILED' },
    });
  });

  it('rejects a tab that became pinned before saving', async () => {
    const dependencies = createDependencies();
    dependencies.getTab = vi.fn(async (tabId) => ({
      ...tabs.find((tab) => tab.id === tabId)!,
      pinned: tabId === 11,
    }));

    const response = await executeParkSelectedTabs(message, dependencies);

    expect(dependencies.persistTabs).not.toHaveBeenCalled();
    expect(dependencies.closeTab).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false,
      error: { code: 'TAB_NOT_ELIGIBLE' },
    });
  });

  it('reports a tab that was saved but could not be closed', async () => {
    const dependencies = createDependencies();
    dependencies.closeTab = vi.fn(async (tabId) => {
      if (tabId === 11) {
        throw new Error('close failed');
      }
    });

    const response = await executeParkSelectedTabs(message, dependencies);

    expect(response).toMatchObject({
      success: true,
      closedTabIds: [10],
      failedToCloseTabIds: [11],
    });
  });
});
