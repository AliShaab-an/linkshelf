import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDatabase } from '@/domain/defaults';
import type { LinkShelfBackup, SavedLink } from '@/domain/schemas';

describe('background operation outcomes', () => {
  let listener: (message: unknown, sender: unknown, reply: (result: any) => void) => boolean;
  let command: (name: string, tab: any) => void;
  let values: Record<string, any>;
  let api: any;
  let nextTab: number;

  function event() { return { addListener: vi.fn() }; }
  function stored() { return values.linkshelfDatabase; }
  async function request(message: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!listener(message, {}, resolve)) reject(new Error('Message was not handled'));
    });
  }
  async function park(reminder = false, ids = [1]) {
    return request({ type: 'PARK_SELECTED_TABS', payload: {
      tabIds: ids, projectId: 'inbox', ...(reminder ? { reminderAt: '2099-01-01T10:00:00.000Z' } : {}),
    } });
  }
  async function parkedLink(): Promise<SavedLink> {
    await park();
    return stored().links[0];
  }
  async function importPreview() {
    const backup: LinkShelfBackup = { format: 'linkshelf-backup', schemaVersion: 2, exportedAt: '2026-11-09T10:00:00.000Z', database: createEmptyDatabase() };
    const preview = await request({ type: 'PREVIEW_IMPORT_DATA', payload: { backup, mode: 'replace' } });
    return { type: 'IMPORT_DATA', payload: { backup, mode: 'replace', revisionToken: preview.preview.revisionToken } };
  }

  beforeEach(async () => {
    vi.resetModules();
    values = {};
    nextTab = 100;
    api = {
      storage: { local: {
        get: vi.fn(async (key: string) => ({ [key]: structuredClone(values[key]) })),
        set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(values, structuredClone(patch)); }),
      }, session: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
      runtime: { getURL: (path: string) => path, onInstalled: event(), onStartup: event(), onMessage: {
        addListener: (callback: typeof listener) => { listener = callback; },
      } },
      sidePanel: { open: vi.fn(async () => undefined) },
      windows: { getLastFocused: vi.fn(async () => ({ id: 1 })) },
      tabs: {
        get: vi.fn(async (id: number) => ({ id, windowId: 1, index: id, pinned: false, title: `Tab ${id}`, url: `https://example.com/${id}` })),
        query: vi.fn(async () => []), remove: vi.fn(async () => undefined),
        create: vi.fn(async () => ({ id: nextTab++ })), discard: vi.fn(async () => ({ discarded: true })),
      },
      alarms: { onAlarm: event(), getAll: vi.fn(async () => []), clear: vi.fn(async () => true), create: vi.fn(async () => undefined) },
      notifications: { getAll: vi.fn(async () => ({})), getPermissionLevel: vi.fn(async () => 'granted'), create: vi.fn(async () => 'notification') },
      bookmarks: { getTree: vi.fn(async () => []), create: vi.fn(async (input: unknown) => ({ ...input as object, id: 'bookmark-1' })) },
      commands: { onCommand: { addListener: (callback: typeof command) => { command = callback; } } },
    };
    vi.stubGlobal('browser', api);
    vi.stubGlobal('defineBackground', (callback: () => void) => callback);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const module = await import('../../entrypoints/background');
    (module.default as unknown as () => void)();
    await request({ type: 'GET_SETTINGS' });
    await vi.waitFor(() => expect(api.alarms.getAll).toHaveBeenCalled());
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('reports complete parking success against persisted data and closed tabs', async () => {
    const result = await park(true, [1, 2]);
    expect(result).toMatchObject({ success: true, saved: true, closedTabIds: [1, 2] });
    expect(result.warnings).toBeUndefined();
    expect(stored().links.map((link: SavedLink) => link.id)).toEqual(result.linkIds);
    expect(api.tabs.remove).toHaveBeenCalledTimes(2);
  });

  it('preserves save and close success after alarm creation fails', async () => {
    api.alarms.create.mockRejectedValue(new Error('Alarm quota exceeded'));
    const result = await park(true);
    expect(result).toMatchObject({ success: true, saved: true, closedTabIds: [1], warnings: [expect.any(String)] });
    expect(stored().links).toHaveLength(1);
    expect(api.tabs.remove).toHaveBeenCalledWith(1);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      errors: [expect.objectContaining({ errors: [expect.objectContaining({ message: 'Alarm quota exceeded' })] })],
    }));
  });

  it('preserves single-tab saved/closed flags when alarm cleanup fails', async () => {
    api.alarms.getAll.mockResolvedValue([{ name: 'linkshelf-reminder:stale', scheduledTime: 0 }]);
    api.alarms.clear.mockRejectedValue(new Error('Alarms unavailable'));
    const result = await request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } });
    expect(result).toMatchObject({ success: true, saved: true, closed: true, warnings: [expect.any(String)] });
    expect(stored().links[0].id).toBe(result.linkId);
  });

  it('does not close any tabs after primary persistence failure', async () => {
    api.storage.local.set.mockRejectedValueOnce(new Error('Disk failure'));
    const result = await park();
    expect(result).toMatchObject({ success: false, saved: false, closedTabIds: [] });
    expect(stored().links).toHaveLength(0);
    expect(api.tabs.remove).not.toHaveBeenCalled();
  });

  it('preserves partial tab closure and alarm warnings independently', async () => {
    api.tabs.remove.mockImplementation(async (id: number) => { if (id === 2) throw new Error('Cannot close'); });
    api.alarms.create.mockRejectedValue(new Error('Alarm failure'));
    const result = await park(true, [1, 2]);
    expect(result).toMatchObject({ success: true, saved: true, closedTabIds: [1], failedToCloseTabIds: [2], warnings: [expect.any(String)] });
    expect(stored().links).toHaveLength(2);
  });

  it('preserves saved-but-not-closed single-tab result after secondary failure', async () => {
    api.tabs.remove.mockRejectedValue(new Error('Cannot close'));
    api.alarms.getAll.mockResolvedValue([{ name: 'linkshelf-reminder:stale', scheduledTime: 0 }]);
    api.alarms.clear.mockRejectedValue(new Error('Cannot update alarms'));
    const result = await request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } });
    expect(result).toMatchObject({ success: false, saved: true, closed: false, error: { code: 'TAB_CLOSE_FAILED' }, warnings: [expect.any(String)] });
    expect(stored().links).toHaveLength(1);
  });

  it('reports committed import success despite reminder reconciliation failure', async () => {
    await parkedLink();
    const message = await importPreview();
    api.alarms.getAll.mockRejectedValue(new Error('Alarm service offline'));
    const result = await request(message);
    expect(result).toMatchObject({ success: true, result: { mode: 'replace' }, warnings: [expect.stringContaining('imported')] });
    expect(stored().links).toHaveLength(0);
  });

  it.each(['write', 'rollback'])('reports import %s failure honestly and retains verified state', async (failure) => {
    await parkedLink();
    const message = await importPreview();
    const before = structuredClone(stored());
    const original = api.storage.local.set.getMockImplementation();
    api.storage.local.set.mockRejectedValueOnce(new Error('Write failed'));
    if (failure === 'rollback') api.storage.local.set.mockRejectedValueOnce(new Error('Rollback failed'));
    else api.storage.local.set.mockImplementation(original);
    const result = await request(message);
    expect(result.success).toBe(false);
    expect(result.error.message).toMatch(failure === 'rollback' ? /could not verify rollback/ : /Write failed/);
    expect(stored()).toEqual(before);
    expect(result.warnings).toBeUndefined();
  });

  it('rejects invalid imports without changing data', async () => {
    await parkedLink();
    const before = structuredClone(stored());
    const result = await request({ type: 'IMPORT_DATA', payload: { backup: {}, mode: 'replace', revisionToken: 'invalid' } });
    expect(result.success).toBe(false);
    expect(stored()).toEqual(before);
  });

  it('retains successful restore result after alarm cleanup failure', async () => {
    const link = await parkedLink();
    api.alarms.getAll.mockResolvedValue([{ name: 'linkshelf-reminder:stale', scheduledTime: 0 }]);
    api.alarms.clear.mockRejectedValue(new Error('Alarm cleanup failed'));
    const result = await request({ type: 'RESTORE_LINK', payload: { linkId: link.id } });
    expect(result).toMatchObject({ success: true, opened: true, restored: true, warnings: [expect.any(String)] });
    expect(stored().links[0].status).toBe('restored');
    expect(api.tabs.create).toHaveBeenCalledTimes(1);
  });

  it.each(['RESTORE_SESSION', 'RESTORE_PROJECT'])('preserves committed %s progress after alarm failure', async (type) => {
    await park(false, [1, 2]);
    api.alarms.getAll.mockRejectedValue(new Error('Alarm failure'));
    const result = await request({ type, payload: type === 'RESTORE_SESSION' ? { sessionId: stored().sessions[0].id } : { projectId: 'inbox', mode: 'normal' } });
    expect(result.success).toBe(true);
    expect(result.openedLinkIds).toHaveLength(2);
    expect(result.restoredLinkIds).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(stored().links.every((link: SavedLink) => link.status === 'restored')).toBe(true);
  });

  it('reports opened tabs and completed records on a mid-restore write failure', async () => {
    await park(false, [1, 2]);
    const original = api.storage.local.set.getMockImplementation();
    api.storage.local.set.mockImplementationOnce(original).mockRejectedValueOnce(new Error('Second state write failed'));
    const result = await request({ type: 'RESTORE_SESSION', payload: { sessionId: stored().sessions[0].id } });
    expect(result).toMatchObject({ success: false, opened: true, error: { code: 'STORAGE_FAILED' } });
    expect(result.progress.openedLinkIds).toHaveLength(2);
    expect(result.progress.restoredLinkIds).toHaveLength(1);
    expect(stored().links.map((link: SavedLink) => link.status)).toEqual(['restored', 'parked']);
  });

  it('preserves opened=true when a single restore state write fails', async () => {
    const link = await parkedLink();
    api.storage.local.set.mockRejectedValueOnce(new Error('State write failed'));
    const result = await request({ type: 'RESTORE_LINK', payload: { linkId: link.id } });
    expect(result).toMatchObject({ success: false, opened: true, error: { code: 'STORAGE_FAILED' } });
    expect(stored().links[0].status).toBe('parked');
  });

  it.each(['ARCHIVE_LINK', 'REMOVE_LINK'])('preserves %s mutation despite alarm failure', async (type) => {
    const link = await parkedLink();
    api.alarms.getAll.mockRejectedValue(new Error('Alarm failure'));
    const result = await request({ type, payload: { linkId: link.id } });
    const status = type === 'ARCHIVE_LINK' ? 'archived' : 'removed';
    expect(result).toMatchObject({ success: true, link: { status }, warnings: [expect.any(String)] });
    expect(stored().links[0].status).toBe(status);
  });

  it('preserves unarchive after notification delivery fails', async () => {
    api.notifications.create.mockRejectedValue(new Error('Notifications unavailable'));
    const parked = await request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox', reminderAt: '2020-01-01T00:00:00.000Z' } });
    await request({ type: 'ARCHIVE_LINK', payload: { linkId: parked.linkId } });
    api.notifications.create.mockRejectedValue(new Error('Notifications unavailable'));
    const result = await request({ type: 'UNARCHIVE_LINK', payload: { linkId: parked.linkId } });
    expect(result).toMatchObject({ success: true, link: { status: 'parked' }, warnings: [expect.any(String)] });
    expect(stored().links[0].status).toBe('parked');
  });

  it('preserves bookmark creation and retirement when alarms fail', async () => {
    const link = await parkedLink();
    api.alarms.getAll.mockRejectedValue(new Error('Alarm failure'));
    const result = await request({ type: 'BOOKMARK_LINK', payload: { linkId: link.id, parentId: 'folder' } });
    expect(result).toMatchObject({ success: true, bookmark: { id: 'bookmark-1' }, warnings: [expect.any(String)] });
    expect(stored().links[0]).toMatchObject({ status: 'removed', bookmarkId: 'bookmark-1' });
    expect(api.bookmarks.create).toHaveBeenCalledTimes(1);
  });

  it('preserves bookmarkCreated=true when both state update and alarms fail', async () => {
    const link = await parkedLink();
    api.storage.local.set.mockRejectedValueOnce(new Error('State write failed'));
    api.alarms.getAll.mockRejectedValue(new Error('Alarm failure'));
    const result = await request({ type: 'BOOKMARK_LINK', payload: { linkId: link.id, parentId: 'folder' } });
    expect(result).toMatchObject({ success: false, bookmarkCreated: true, error: { code: 'STORAGE_FAILED' }, warnings: [expect.any(String)] });
    expect(stored().links[0].status).toBe('parked');
    expect(api.bookmarks.create).toHaveBeenCalledTimes(1);
  });

  it('logs feedback failure without claiming keyboard parking failed', async () => {
    api.notifications.create.mockRejectedValue(new Error('Feedback unavailable'));
    command('park-current-tab', { id: 1, windowId: 1 });
    await vi.waitFor(() => expect(api.notifications.create).toHaveBeenCalledTimes(1));
    expect(stored().links).toHaveLength(1);
    expect(api.tabs.remove).toHaveBeenCalledWith(1);
    expect(console.error).not.toHaveBeenCalledWith('Unexpected keyboard parking failure:', expect.anything());
  });
});
