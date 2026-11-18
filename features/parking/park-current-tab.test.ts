import { describe, expect, it, vi } from 'vitest';
import type { ParkCurrentTabMessage } from '@/messaging/contracts';
import type { ParkTabResult } from '@/storage/repository';
import {
  executeParkCurrentTab,
  type BrowserTabSnapshot,
  type ParkCurrentTabDependencies,
} from './park-current-tab';

const message: ParkCurrentTabMessage = {
  type: 'PARK_CURRENT_TAB',
  payload: {
    tabId: 42,
    projectId: 'inbox',
    note: 'Read this later',
    reminderAt: '2099-08-10T18:30:00.000Z',
  },
};

const tab: BrowserTabSnapshot = {
  id: 42,
  title: 'React documentation',
  url: 'https://react.dev/learn?utm_source=test',
  favIconUrl: 'https://react.dev/favicon.ico',
  windowId: 3,
  index: 4,
  pinned: false,
};

const parkedRecords: ParkTabResult = {
  session: {
    id: 'session-1',
    projectId: 'inbox',
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
  },
  link: {
    id: 'link-1',
    sessionId: 'session-1',
    projectId: 'inbox',
    title: 'React documentation',
    url: tab.url!,
    normalizedUrl: 'https://react.dev/learn',
    domain: 'react.dev',
    status: 'parked',
    pinnedBeforeParking: false,
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
  },
};

function createDependencies(): ParkCurrentTabDependencies {
  return {
    getTab: vi.fn().mockResolvedValue(tab),
    persistTab: vi.fn().mockResolvedValue(parkedRecords),
    findParkedDuplicateUrls: vi.fn().mockResolvedValue([]),
    closeTab: vi.fn().mockResolvedValue(undefined),
  };
}

describe('executeParkCurrentTab', () => {
  it('persists the tab before closing it', async () => {
    const events: string[] = [];
    const dependencies = createDependencies();
    dependencies.persistTab = vi.fn(async () => {
      events.push('saved');
      return parkedRecords;
    });
    dependencies.closeTab = vi.fn(async () => {
      events.push('closed');
    });

    const response = await executeParkCurrentTab(message, dependencies);

    expect(events).toEqual(['saved', 'closed']);
    expect(dependencies.persistTab).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'inbox',
        note: 'Read this later',
        reminderAt: '2099-08-10T18:30:00.000Z',
      }),
    );
    expect(response).toEqual({
      success: true,
      saved: true,
      closed: true,
      linkId: 'link-1',
      sessionId: 'session-1',
    });
  });

  it('leaves the tab open when persistence fails', async () => {
    const dependencies = createDependencies();
    dependencies.persistTab = vi.fn().mockRejectedValue(new Error('storage failed'));

    const response = await executeParkCurrentTab(message, dependencies);

    expect(dependencies.closeTab).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false,
      saved: false,
      closed: false,
      error: { code: 'STORAGE_FAILED' },
    });
  });

  it('reports when the tab was saved but could not be closed', async () => {
    const dependencies = createDependencies();
    dependencies.closeTab = vi.fn().mockRejectedValue(new Error('close failed'));

    const response = await executeParkCurrentTab(message, dependencies);

    expect(response).toMatchObject({
      success: false,
      saved: true,
      closed: false,
      error: { code: 'TAB_CLOSE_FAILED' },
    });
  });

  it('does not persist or close restricted Chrome pages', async () => {
    const dependencies = createDependencies();
    dependencies.getTab = vi.fn().mockResolvedValue({
      ...tab,
      url: 'chrome://settings',
    });

    const response = await executeParkCurrentTab(message, dependencies);

    expect(dependencies.persistTab).not.toHaveBeenCalled();
    expect(dependencies.closeTab).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      success: false,
      error: { code: 'TAB_NOT_ELIGIBLE' },
    });
  });

  describe('duplicates', () => {
    const skip: ParkCurrentTabMessage = { ...message, payload: { ...message.payload, duplicates: 'skip' } };

    it('does not check for duplicates unless asked', async () => {
      const dependencies = createDependencies();
      await executeParkCurrentTab(message, dependencies);
      expect(dependencies.findParkedDuplicateUrls).not.toHaveBeenCalled();
    });

    it('closes an already-saved tab without creating a second record', async () => {
      const dependencies = createDependencies();
      vi.mocked(dependencies.findParkedDuplicateUrls).mockResolvedValue([tab.url!]);
      const response = await executeParkCurrentTab(skip, dependencies);
      expect(dependencies.persistTab).not.toHaveBeenCalled();
      expect(dependencies.closeTab).toHaveBeenCalledWith(42);
      expect(response).toEqual({ success: true, saved: true, closed: true, skippedDuplicate: true });
    });

    it('saves normally when the URL is new', async () => {
      const dependencies = createDependencies();
      const response = await executeParkCurrentTab(skip, dependencies);
      expect(dependencies.persistTab).toHaveBeenCalledTimes(1);
      expect(response).toMatchObject({ success: true, linkId: 'link-1' });
    });

    it('keeps the tab open when the duplicate check fails', async () => {
      const dependencies = createDependencies();
      vi.mocked(dependencies.findParkedDuplicateUrls).mockRejectedValue(new Error('read failed'));
      const response = await executeParkCurrentTab(skip, dependencies);
      expect(dependencies.closeTab).not.toHaveBeenCalled();
      expect(response).toMatchObject({ success: false, saved: false, error: { code: 'STORAGE_FAILED' } });
    });
  });
});
