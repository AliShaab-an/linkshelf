import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkShelfDatabase, SavedLink } from '@/domain/schemas';

const NOW = '2026-11-09T10:00:00.000Z';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('concurrent operations through actual background handlers', () => {
  let api: any;
  let values: Record<string, any>;
  let tabs: Map<number, any>;
  let bookmarks: any[];
  let windows: Set<number>;
  let focused: number;
  let nextTab: number;
  let boot: () => void;
  let listener: (message: unknown, sender: unknown, reply: (response: any) => void) => boolean;
  let keyboard: (command: string, tab: any) => void;
  const stored = () => values.linkshelfDatabase as LinkShelfDatabase;
  function event() {
    const handlers = new Set<(...args: any[]) => void>();
    return {
      addListener: (handler: (...args: any[]) => void) => handlers.add(handler),
      removeListener: (handler: (...args: any[]) => void) => handlers.delete(handler),
      fire: (...args: any[]) => [...handlers].forEach((handler) => handler(...args)),
      size: () => handlers.size,
    };
  }
  function request(message: unknown, windowId?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!listener(message, windowId === undefined ? {} : { tab: { windowId } }, resolve)) reject(new Error('Unhandled request'));
    });
  }
  function holdNext(mock: any) {
    const entered = deferred();
    const released = deferred();
    const original = mock.getMockImplementation();
    mock.mockImplementationOnce(async (...args: any[]) => {
      entered.resolve();
      await released.promise;
      return original(...args);
    });
    return { entered: entered.promise, release: released.resolve };
  }
  async function park(ids = [1, 2], extra: Record<string, unknown> = {}) {
    const result = await request({ type: 'PARK_SELECTED_TABS', payload: { tabIds: ids, projectId: 'inbox', ...extra } });
    expect(result.saved).toBe(true);
    return stored().links.filter((link) => result.linkIds.includes(link.id));
  }
  function single(link: SavedLink, windowId?: number) { return request({ type: 'RESTORE_LINK', payload: { linkId: link.id } }, windowId); }
  function session(link: SavedLink, windowId?: number) { return request({ type: 'RESTORE_SESSION', payload: { sessionId: link.sessionId } }, windowId); }
  function project(projectId = 'inbox', mode = 'normal', windowId?: number) { return request({ type: 'RESTORE_PROJECT', payload: { projectId, mode } }, windowId); }
  function bookmark(link: SavedLink, parentId = 'folder', windowId?: number) { return request({ type: 'BOOKMARK_LINK', payload: { linkId: link.id, parentId } }, windowId); }
  async function settings(patch: Record<string, unknown>) {
    return request({ type: 'UPDATE_SETTINGS', payload: { ...(await request({ type: 'GET_SETTINGS' })).settings, ...patch } });
  }
  function change(id: number, patch: Record<string, unknown>) { Object.assign(tabs.get(id), patch); api.tabs.onUpdated.fire(id, patch); }
  function busy(result: any) { expect(result).toMatchObject({ success: false, error: { code: 'OPERATION_IN_PROGRESS' } }); }

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    values = {};
    tabs = new Map(Array.from({ length: 8 }, (_, i) => [i + 1, {
      id: i + 1, windowId: 1, index: i, title: `Synthetic ${i + 1}`, url: `https://example.com/${i + 1}`, pinned: false,
    }]));
    windows = new Set([1, 2]); focused = 1; nextTab = 100;
    bookmarks = [];
    api = {
      storage: { local: {
        get: vi.fn(async (key: string) => ({ [key]: structuredClone(values[key]) })),
        set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(values, structuredClone(patch)); }),
      }, session: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
      runtime: { getURL: (path: string) => path, onInstalled: event(), onStartup: event(), onMessage: {
        addListener: (callback: typeof listener) => { listener = callback; },
      } },
      tabs: {
        onUpdated: event(), onRemoved: event(), onReplaced: event(), onDetached: event(),
        get: vi.fn(async (id: number) => { if (!tabs.has(id)) throw new Error('No such tab'); return structuredClone(tabs.get(id)); }),
        query: vi.fn(async ({ windowId }: { windowId?: number }) => [...tabs.values()].filter((tab) => tab.windowId === (windowId ?? focused))),
        remove: vi.fn(async (id: number) => { if (!tabs.delete(id)) throw new Error('No such tab'); api.tabs.onRemoved.fire(id); }),
        create: vi.fn(async (input: any) => {
          const windowId = input.windowId ?? focused;
          if (!windows.has(windowId)) throw new Error('Target window closed');
          const siblings = [...tabs.values()].filter((tab) => tab.windowId === windowId);
          const index = input.index ?? siblings.length;
          siblings.filter((tab) => tab.index >= index).forEach((tab) => tab.index++);
          const tab = { ...input, id: nextTab++, windowId, index, pinned: false };
          tabs.set(tab.id, tab);
          return structuredClone(tab);
        }),
        discard: vi.fn(async () => ({ discarded: true })),
      },
      windows: { getLastFocused: vi.fn(async () => ({ id: focused })) },
      sidePanel: { open: vi.fn(async () => undefined) },
      alarms: { onAlarm: event(), getAll: vi.fn(async () => []), clear: vi.fn(async () => true), create: vi.fn(async () => undefined) },
      notifications: { getAll: vi.fn(async () => ({})), getPermissionLevel: vi.fn(async () => 'granted'), create: vi.fn(async () => 'notification') },
      bookmarks: {
        getTree: vi.fn(async () => structuredClone(bookmarks)),
        create: vi.fn(async (input: any) => { const item = { ...input, id: `bookmark-${bookmarks.length + 1}` }; bookmarks.push(item); return item; }),
      },
      commands: { onCommand: { addListener: (callback: typeof keyboard) => { keyboard = callback; } } },
    };
    vi.stubGlobal('browser', api);
    vi.stubGlobal('defineBackground', (callback: () => void) => callback);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    boot = (await import('../../entrypoints/background')).default as unknown as () => void;
    boot();
    await request({ type: 'GET_DUE_REMINDER_LINKS' });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('rejects simultaneous single-link restores from separate interfaces before a second create', async () => {
    const [link] = await park([1]);
    const barrier = holdNext(api.tabs.create);
    const first = single(link, 1);
    await barrier.entered;
    busy(await single(link, 2));
    barrier.release();
    expect((await first).restored).toBe(true);
    expect(api.tabs.create).toHaveBeenCalledTimes(1);
    expect(stored().links[0].status).toBe('restored');
  });

  it.each(['single-session', 'session-single', 'session-project', 'project-project'])('prevents duplicate effects for overlapping %s', async (pair) => {
    const [link] = await park();
    const barrier = holdNext(api.tabs.create);
    const first = pair.startsWith('single') ? single(link) : pair.startsWith('session') ? session(link) : project();
    await barrier.entered;
    const second = pair.endsWith('single') ? single(link) : pair.endsWith('session') ? session(link) : project();
    busy(await second);
    barrier.release();
    expect((await first).success).toBe(true);
    expect(api.tabs.create).toHaveBeenCalledTimes(pair.startsWith('single') ? 1 : 2);
  });

  it('allows a later intentional Keep Parked Copies reopen but rejects an in-flight duplicate', async () => {
    const [link] = await park([1]);
    await settings({ defaultRestoreBehavior: 'open-copy' });
    const barrier = holdNext(api.tabs.create);
    const first = single(link);
    await barrier.entered;
    busy(await single(link));
    barrier.release();
    expect(await first).toMatchObject({ success: true, restored: false });
    expect(await single(link)).toMatchObject({ success: true, restored: false });
    expect(api.tabs.create).toHaveBeenCalledTimes(2);
    expect(stored().links[0].status).toBe('parked');
  });

  it('permits later intentional collection copies without allowing concurrent duplicates', async () => {
    const [link] = await park();
    await settings({ defaultRestoreBehavior: 'open-copy' });
    const barrier = holdNext(api.tabs.create);
    const first = session(link);
    await barrier.entered;
    busy(await project());
    barrier.release();
    expect((await first).restoredLinkIds).toEqual([]);
    expect((await session(link)).success).toBe(true);
    expect(api.tabs.create).toHaveBeenCalledTimes(4);
    expect(stored().links.every((item) => item.status === 'parked')).toBe(true);
  });

  it('releases reservations after opening fails and allows an explicit valid retry', async () => {
    const [link] = await park([1]);
    api.tabs.create.mockRejectedValueOnce(new Error('Chrome rejected create'));
    expect(await single(link)).toMatchObject({ success: false, opened: false, error: { code: 'TAB_OPEN_FAILED' } });
    expect((await single(link)).success).toBe(true);
    expect(api.tabs.create).toHaveBeenCalledTimes(2);
  });

  it('retries confirmed-open persistence without opening another tab', async () => {
    const [link] = await park([1]);
    api.storage.local.set.mockRejectedValueOnce(new Error('Disk failure'));
    expect(await single(link)).toMatchObject({ success: false, opened: true, error: { code: 'STORAGE_FAILED' } });
    expect(stored().links[0].status).toBe('parked');
    expect((await single(link)).restored).toBe(true);
    expect(api.tabs.create).toHaveBeenCalledTimes(1);
    expect(stored().links[0].status).toBe('restored');
  });

  it('recovers partial collection writes and does not reopen its confirmed earlier tab', async () => {
    const links = await park();
    const set = api.storage.local.set.getMockImplementation();
    api.storage.local.set.mockImplementationOnce(set).mockRejectedValueOnce(new Error('Second write fails'));
    const result = await session(links[0]);
    expect(result).toMatchObject({ success: false, opened: true, progress: { openedLinkIds: links.map((link) => link.id), restoredLinkIds: [links[0].id] } });
    expect(stored().links.map((link) => link.status)).toEqual(['restored', 'parked']);
    expect((await project()).success).toBe(true);
    expect(api.tabs.create).toHaveBeenCalledTimes(2);
    expect(stored().links.every((link) => link.status === 'restored')).toBe(true);
  });

  it.each(['ARCHIVE_LINK', 'REMOVE_LINK', 'MOVE_LINK', 'BOOKMARK_LINK'])('coordinates %s against a running restore', async (type) => {
    const [link] = await park([1]);
    const barrier = holdNext(api.tabs.create);
    const first = single(link);
    await barrier.entered;
    busy(await request({ type, payload: { linkId: link.id, projectId: 'inbox', parentId: 'folder' } }));
    barrier.release();
    await first;
    expect(api.bookmarks.create).not.toHaveBeenCalled();
    expect(stored().links[0].status).toBe('restored');
  });

  it('coordinates simultaneous bookmark conversions of one link across interfaces', async () => {
    const [link] = await park([1]);
    const barrier = holdNext(api.bookmarks.create);
    const first = bookmark(link, 'folder', 1);
    await barrier.entered;
    busy(await bookmark(link, 'other-folder', 2));
    busy(await single(link));
    barrier.release();
    expect((await first).success).toBe(true);
    expect(api.bookmarks.create).toHaveBeenCalledTimes(1);
    expect(stored().links[0]).toMatchObject({ status: 'removed', bookmarkId: 'bookmark-1' });
  });

  it('serializes equivalent URLs from different links and retains existing duplicate policy across folders', async () => {
    tabs.get(2).url = 'https://example.com/1?utm_source=test#section';
    const links = await park();
    const barrier = holdNext(api.bookmarks.create);
    const first = bookmark(links[0]);
    await barrier.entered;
    const second = bookmark(links[1], 'different-folder');
    barrier.release();
    expect((await first).success).toBe(true);
    expect(await second).toMatchObject({ success: false, bookmarkCreated: false, error: { code: 'DUPLICATE_BOOKMARK' } });
    expect(api.bookmarks.create).toHaveBeenCalledTimes(1);
    expect(stored().links.map((link) => link.status)).toEqual(['removed', 'parked']);
    expect(bookmarks).toHaveLength(1);
  });

  it('does not block unrelated bookmark URLs while another creation is pending', async () => {
    const links = await park();
    const barrier = holdNext(api.bookmarks.create);
    const first = bookmark(links[0]);
    await barrier.entered;
    expect((await bookmark(links[1])).success).toBe(true);
    barrier.release(); await first;
    expect(api.bookmarks.create).toHaveBeenCalledTimes(2);
  });

  it('finishes a confirmed bookmark after persistence fails without creating another on retry', async () => {
    const [link] = await park([1]);
    api.storage.local.set.mockRejectedValueOnce(new Error('Disk failure'));
    expect(await bookmark(link)).toMatchObject({ success: false, bookmarkCreated: true, error: { code: 'STORAGE_FAILED' } });
    expect(stored().links[0].status).toBe('parked');
    expect((await bookmark(link)).success).toBe(true);
    expect(api.bookmarks.create).toHaveBeenCalledTimes(1);
    expect(stored().links[0]).toMatchObject({ status: 'removed', bookmarkId: 'bookmark-1' });
  });

  it('does not recreate a confirmed bookmark that disappears before saved-state recovery', async () => {
    const [link] = await park([1]);
    api.storage.local.set.mockRejectedValueOnce(new Error('Disk failure'));
    await bookmark(link);
    bookmarks.length = 0;
    expect(await bookmark(link)).toMatchObject({ success: false, bookmarkCreated: true, error: { code: 'BOOKMARK_RECOVERY_REQUIRED' } });
    expect(api.bookmarks.create).toHaveBeenCalledTimes(1);
    expect(stored().links[0].status).toBe('parked');
  });

  it('releases bookmark reservations and URL queues after API failure', async () => {
    const [link] = await park([1]);
    api.bookmarks.create.mockRejectedValueOnce(new Error('Rejected create'));
    expect((await bookmark(link)).success).toBe(false);
    expect((await bookmark(link)).success).toBe(true);
    expect(api.bookmarks.create).toHaveBeenCalledTimes(2);
  });

  it('preserves duplicate detection after a worker-style restart loses its receipt', async () => {
    const [link] = await park([1]);
    api.storage.local.set.mockRejectedValueOnce(new Error('Disk failure'));
    await bookmark(link);
    boot();
    await request({ type: 'GET_DUE_REMINDER_LINKS' });
    expect(await bookmark(link)).toMatchObject({ success: false, error: { code: 'DUPLICATE_BOOKMARK' } });
    expect(api.bookmarks.create).toHaveBeenCalledTimes(1);
    expect(stored().links[0].status).toBe('parked');
  });

  it('saves unchanged tabs before inspecting and closing them', async () => {
    const links = await park([1]);
    expect(links).toHaveLength(1);
    expect(tabs.has(1)).toBe(false);
    expect(api.tabs.get).toHaveBeenCalledTimes(2);
    expect(api.tabs.remove).toHaveBeenCalledTimes(1);
    expect(api.storage.local.set.mock.invocationCallOrder.at(-1)).toBeLessThan(api.tabs.remove.mock.invocationCallOrder[0]);
    expect(api.tabs.onUpdated.size()).toBe(0);
  });

  it.each(['url', 'fragment', 'pending', 'window', 'pinned', 'round-trip', 'replacement', 'loading'])('keeps a tab changed by %s during persistence open', async (kind) => {
    const barrier = holdNext(api.storage.local.set);
    const savedUrl = tabs.get(1).url;
    const parking = request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } });
    await barrier.entered;
    if (kind === 'url') change(1, { url: 'https://example.com/important-form' });
    if (kind === 'fragment') tabs.get(1).url += '#unsaved';
    if (kind === 'pending') tabs.get(1).pendingUrl = 'https://example.com/new-page';
    if (kind === 'window') tabs.get(1).windowId = 2;
    if (kind === 'pinned') tabs.get(1).pinned = true;
    if (kind === 'round-trip') { change(1, { url: 'https://example.com/other' }); change(1, { url: savedUrl }); }
    if (kind === 'replacement') api.tabs.onReplaced.fire(99, 1);
    if (kind === 'loading') api.tabs.onUpdated.fire(1, { status: 'loading' });
    barrier.release();
    expect(await parking).toMatchObject({ success: false, saved: true, closed: false, error: { code: 'TAB_CHANGED' } });
    expect(stored().links[0].url).toBe(savedUrl);
    expect(tabs.has(1)).toBe(true);
    expect(api.tabs.remove).not.toHaveBeenCalled();
    expect(api.tabs.onUpdated.size()).toBe(0);
    expect(api.tabs.onReplaced.size()).toBe(0);
  });

  it.each(['disappeared', 'inspection', 'closure'])('preserves saved data when %s prevents confirmed closure', async (kind) => {
    const barrier = holdNext(api.storage.local.set);
    const parking = request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } });
    await barrier.entered;
    if (kind === 'disappeared') { tabs.delete(1); api.tabs.onRemoved.fire(1); }
    if (kind === 'inspection') api.tabs.get.mockRejectedValueOnce(new Error('Cannot inspect'));
    if (kind === 'closure') api.tabs.remove.mockRejectedValueOnce(new Error('Cannot close'));
    barrier.release();
    expect(await parking).toMatchObject({ success: false, saved: true, closed: false, error: { code: 'TAB_CLOSE_FAILED' } });
    expect(stored().links).toHaveLength(1);
    expect(api.tabs.remove).toHaveBeenCalledTimes(kind === 'closure' ? 1 : 0);
    expect(api.tabs.onRemoved.size()).toBe(0);
  });

  it('closes only unchanged members of a bulk save and reports skipped closures', async () => {
    const barrier = holdNext(api.storage.local.set);
    const parking = request({ type: 'PARK_SELECTED_TABS', payload: { tabIds: [1, 2, 3], projectId: 'inbox' } });
    await barrier.entered;
    change(2, { url: 'https://example.com/form' });
    tabs.delete(3);
    barrier.release();
    expect(await parking).toMatchObject({ success: true, saved: true, closedTabIds: [1], failedToCloseTabIds: [2, 3], warnings: [expect.any(String)] });
    expect(stored().links).toHaveLength(3);
    expect(tabs.has(2)).toBe(true);
    expect(api.tabs.remove).toHaveBeenCalledTimes(1);
  });

  it('preserves the current-tab pinned policy and rejects pinned bulk selection', async () => {
    tabs.get(1).pinned = true;
    expect(await request({ type: 'PARK_SELECTED_TABS', payload: { tabIds: [1], projectId: 'inbox' } })).toMatchObject({ success: false, saved: false, error: { code: 'TAB_NOT_ELIGIBLE' } });
    expect(await request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } })).toMatchObject({ success: true, saved: true, closed: true });
    expect(stored().links[0].pinnedBeforeParking).toBe(true);
  });

  it('reserves overlapping current/bulk parking before any duplicate persistence', async () => {
    const barrier = holdNext(api.storage.local.set);
    const first = request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } });
    await barrier.entered;
    busy(await request({ type: 'PARK_SELECTED_TABS', payload: { tabIds: [1, 2], projectId: 'inbox' } }));
    barrier.release(); await first;
    expect(stored().links).toHaveLength(1);
    expect(tabs.has(2)).toBe(true);
  });

  it('applies the same safe snapshot check to keyboard parking', async () => {
    const barrier = holdNext(api.storage.local.set);
    const complete = deferred();
    api.notifications.create.mockImplementation(async () => { complete.resolve(); return 'feedback'; });
    keyboard('park-current-tab', tabs.get(1));
    await barrier.entered;
    change(1, { url: 'https://example.com/form' });
    barrier.release(); await complete.promise;
    expect(api.tabs.remove).not.toHaveBeenCalled();
    expect(stored().links[0].url).toBe('https://example.com/1');
  });

  it('releases tab reservations and listeners after a save failure', async () => {
    api.storage.local.set.mockRejectedValueOnce(new Error('Disk failure'));
    expect(await request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } })).toMatchObject({ success: false, saved: false });
    expect(api.tabs.onUpdated.size()).toBe(0);
    expect(await request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } })).toMatchObject({ success: true, saved: true });
  });

  it.each(['loading', 'pending'])('never closes a tab whose capture already had %s navigation', async (kind) => {
    if (kind === 'loading') tabs.get(1).status = 'loading';
    else tabs.get(1).pendingUrl = 'https://example.com/new-page';
    const barrier = holdNext(api.storage.local.set);
    const result = request({ type: 'PARK_CURRENT_TAB', payload: { tabId: 1, projectId: 'inbox' } });
    await barrier.entered;
    delete tabs.get(1).pendingUrl;
    tabs.get(1).status = 'complete';
    barrier.release();
    expect(await result).toMatchObject({ success: false, saved: true, error: { code: 'TAB_CHANGED' } });
    expect(api.tabs.remove).not.toHaveBeenCalled();
  });

  it('does not automatically retry an uncertain tab-create outcome', async () => {
    const [link] = await park([1]);
    const create = api.tabs.create.getMockImplementation();
    api.tabs.create.mockImplementationOnce(async (input: any) => { await create(input); throw new Error('Lost API acknowledgment'); });
    const result = await single(link);
    expect(result).toMatchObject({ success: false, opened: false, error: { code: 'TAB_OPEN_FAILED', message: expect.stringContaining('did not confirm') } });
    expect(api.tabs.create).toHaveBeenCalledTimes(1);
    expect([...tabs.keys()].filter((id) => id >= 100)).toHaveLength(1);
    expect(stored().links[0].status).toBe('parked');
  });

  it('avoids another bookmark after an uncertain create outcome is discovered by duplicate detection', async () => {
    const [link] = await park([1]);
    const create = api.bookmarks.create.getMockImplementation();
    api.bookmarks.create.mockImplementationOnce(async (input: any) => { await create(input); throw new Error('Lost API acknowledgment'); });
    expect(await bookmark(link)).toMatchObject({ success: false, bookmarkCreated: false, error: { message: expect.stringContaining('did not confirm') } });
    expect(await bookmark(link)).toMatchObject({ success: false, error: { code: 'DUPLICATE_BOOKMARK' } });
    expect(api.bookmarks.create).toHaveBeenCalledTimes(1);
    expect(bookmarks).toHaveLength(1);
    expect(stored().links[0].status).toBe('parked');
  });

  it('does not replay a confirmed-but-unpersisted open automatically after worker restart', async () => {
    const [link] = await park([1]);
    api.storage.local.set.mockRejectedValueOnce(new Error('Disk failure'));
    await single(link);
    boot();
    await request({ type: 'GET_DUE_REMINDER_LINKS' });
    expect(api.tabs.create).toHaveBeenCalledTimes(1);
    expect(stored().links[0].status).toBe('parked');
  });

  it('releases collection reservations after target inspection fails and allows retry', async () => {
    const [link] = await park();
    api.tabs.query.mockRejectedValueOnce(new Error('Target window unavailable'));
    expect(await session(link)).toMatchObject({ success: false, opened: false });
    expect(api.tabs.create).not.toHaveBeenCalled();
    expect((await session(link)).success).toBe(true);
    expect(api.tabs.create).toHaveBeenCalledTimes(2);
  });

  it('keeps the originally selected target while focus changes during collection restore', async () => {
    const [link] = await park();
    const barrier = holdNext(api.tabs.create);
    const first = session(link);
    await barrier.entered;
    focused = 2;
    barrier.release(); await first;
    expect(api.tabs.create.mock.calls.map(([input]: any[]) => input.windowId)).toEqual([1, 1]);
    expect(api.windows.getLastFocused).toHaveBeenCalledTimes(1);
  });

  it('uses the sender tab window instead of an unrelated focused window', async () => {
    const [link] = await park([1]);
    focused = 2;
    await single(link, 1);
    expect(api.tabs.create.mock.calls[0][0].windowId).toBe(1);
    expect(api.windows.getLastFocused).not.toHaveBeenCalled();
  });

  it('reports partial progress when the fixed target window closes and never redirects', async () => {
    const [link] = await park();
    const create = api.tabs.create.getMockImplementation();
    api.tabs.create.mockImplementationOnce(async (input: any) => { const result = await create(input); windows.delete(1); focused = 2; return result; });
    const result = await session(link);
    expect(result).toMatchObject({ success: true, complete: false });
    expect(result.openedLinkIds).toHaveLength(1);
    expect(result.failedLinkIds).toHaveLength(1);
    expect(api.tabs.create.mock.calls.every(([input]: any[]) => input.windowId === 1)).toBe(true);
    expect(stored().links.map((item) => item.status)).toEqual(['restored', 'parked']);
    expect((await single(stored().links[1], 2)).success).toBe(true);
  });

  it('does not open anything when Chrome cannot provide a target window', async () => {
    const [link] = await park([1]);
    api.windows.getLastFocused.mockResolvedValueOnce({});
    expect(await single(link)).toMatchObject({ success: false, opened: false });
    expect(api.tabs.create).not.toHaveBeenCalled();
    expect((await single(link, 1)).success).toBe(true);
  });

  it('runs unrelated windows independently while one window is blocked', async () => {
    const [firstLink] = await park([1]);
    const [secondLink] = await park([2]);
    const barrier = holdNext(api.tabs.create);
    const first = single(firstLink, 1);
    await barrier.entered;
    expect((await single(secondLink, 2)).success).toBe(true);
    barrier.release(); await first;
    expect([...tabs.values()].filter((tab) => tab.id >= 100).map((tab) => tab.windowId).sort()).toEqual([1, 2]);
  });

  it('keeps concurrent disjoint sessions together and calculates append positions when each batch starts', async () => {
    const firstLinks = await park([1, 2]);
    const secondLinks = await park([3, 4]);
    const barrier = holdNext(api.tabs.create);
    const first = session(firstLinks[0], 1);
    await barrier.entered;
    const second = session(secondLinks[0], 1);
    barrier.release();
    expect((await first).success).toBe(true);
    expect((await second).success).toBe(true);
    const calls = api.tabs.create.mock.calls.map(([input]: any[]) => input);
    expect(calls.map((input: any) => input.url)).toEqual([...firstLinks, ...secondLinks].map((link) => link.url));
    expect(calls.map((input: any) => input.index)).toEqual([4, 5, 6, 7]);
  });

  it.each(['normal', 'unloaded'])('preserves project session order and %s mode', async (mode) => {
    const first = await park([3, 1]);
    vi.setSystemTime('2026-11-09T10:01:00.000Z');
    const second = await park([4, 2]);
    const result = await project('inbox', mode, 1);
    expect(result.success).toBe(true);
    expect(api.tabs.create.mock.calls.map(([input]: any[]) => input.url)).toEqual([second[1], second[0], first[1], first[0]].map((link) => link.url));
    expect(result.discardedLinkIds).toHaveLength(mode === 'unloaded' ? 4 : 0);
    expect(api.tabs.discard).toHaveBeenCalledTimes(mode === 'unloaded' ? 4 : 0);
  });

  it('does not reserve an insertion index for an unconfirmed open, and preserves unload fallback', async () => {
    await park();
    api.tabs.create.mockRejectedValueOnce(new Error('First tab rejected'));
    api.tabs.discard.mockRejectedValueOnce(new Error('Cannot discard'));
    const result = await project('inbox', 'unloaded', 1);
    expect(result).toMatchObject({ success: true, complete: false });
    expect(api.tabs.create.mock.calls.map(([input]: any[]) => input.index)).toEqual([6, 6]);
    expect(result.fallbackLinkIds).toHaveLength(1);
    expect(result.failedLinkIds).toHaveLength(1);
  });
});
