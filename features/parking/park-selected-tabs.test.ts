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
    findParkedDuplicateUrls: vi.fn().mockResolvedValue([]),
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

  describe('duplicates', () => {
    const skip: ParkSelectedTabsMessage = { ...message, payload: { ...message.payload, duplicates: 'skip' } };

    it('does not look for duplicates unless asked', async () => {
      const dependencies = createDependencies();
      await executeParkSelectedTabs(message, dependencies);
      expect(dependencies.findParkedDuplicateUrls).not.toHaveBeenCalled();
      expect(dependencies.persistTabs).toHaveBeenCalledWith(expect.objectContaining({ tabs: expect.arrayContaining([expect.objectContaining({ url: tabs[0].url }), expect.objectContaining({ url: tabs[1].url })]) }));
    });

    it('saves only new tabs, reports skipped ones, and closes both', async () => {
      const dependencies = createDependencies();
      vi.mocked(dependencies.findParkedDuplicateUrls).mockResolvedValue([tabs[0].url]);
      const response = await executeParkSelectedTabs(skip, dependencies);
      const saved = vi.mocked(dependencies.persistTabs).mock.calls[0][0].tabs;
      expect(saved.map((tab) => tab.url)).toEqual([tabs[1].url]);
      expect(response).toMatchObject({ success: true, skippedDuplicateTabIds: [10], closedTabIds: [10, 11] });
      expect(dependencies.closeTab).toHaveBeenCalledTimes(2);
    });

    it('closes without creating a session when every tab is already saved', async () => {
      const dependencies = createDependencies();
      vi.mocked(dependencies.findParkedDuplicateUrls).mockResolvedValue(tabs.map((tab) => tab.url));
      const response = await executeParkSelectedTabs(skip, dependencies);
      expect(dependencies.persistTabs).not.toHaveBeenCalled();
      expect(response).toMatchObject({ success: true, linkIds: [], skippedDuplicateTabIds: [10, 11], closedTabIds: [10, 11] });
      expect('sessionId' in response).toBe(false);
    });

    it('keeps every tab open when the duplicate check or save fails', async () => {
      const dependencies = createDependencies();
      vi.mocked(dependencies.findParkedDuplicateUrls).mockRejectedValue(new Error('read failed'));
      const response = await executeParkSelectedTabs(skip, dependencies);
      expect(response).toMatchObject({ success: false, error: { code: 'STORAGE_FAILED' } });
      expect(dependencies.closeTab).not.toHaveBeenCalled();
    });
  });
});
